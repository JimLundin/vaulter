import { WikiBlocks } from '@/modules/wiki/presentation/rendering/blocks.tsx';
import { ChatMessage } from '@/modules/conversation/presentation/ChatMessage.tsx';
import { expect, test } from 'vitest';
import { Text } from '@/shared/ui/kit/index.ts';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMemoryStorage } from '@/core/store/index.ts';
import { wikiActions, readEavWiki } from '@/modules/wiki/index.ts';
import { appendExchangeEmbed, projectedExchange } from '@/modules/conversation/index.ts';
import { applicationDatabase } from './composition/database.ts';
import { readEmbeddedRecord } from './composition/embeds.ts';

test('Wiki and Chat share live identity and pinned state without replaying any write', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const { author, question, exchange } = await db.transaction(async (tx) => {
    const author = await tx.entities.actors.insert({ name: 'Owner', kind: 'user' });
    const question = await tx.entities.questions.insert({
      key: 'question',
      text: 'Original question?',
      status: 'open',
      createdAt: new Date(),
      available: true,
    });
    const conversation = await tx.entities.conversations.insert({ createdAt: new Date() });
    const exchange = await tx.entities.exchanges.insert({ conversation, position: 0 });
    await tx.entities.messages.insert({ exchange, author, at: new Date(), text: 'Discuss this' });
    return { author, question, exchange };
  });
  const original = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.reference(original, question);
  const wiki = wikiActions(db, author);
  const page = await wiki.createPage({ key: 'page', title: 'Page', summary: '' });
  const section = await wiki.append('section', { kind: 'section' }, { page, order: 'a' });
  await wiki.append(
    'live',
    { kind: 'embed', embedTarget: target },
    { parent: section, order: 'a' },
  );
  await wiki.append(
    'pinned',
    { kind: 'embed', embedTarget: target, embedMode: 'pinned' },
    { parent: section, order: 'b' },
  );
  await appendExchangeEmbed(db, exchange, { target }, 0, { author });
  await appendExchangeEmbed(db, exchange, { target, mode: 'pinned' }, 1, { author });
  const hostSnapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db.transaction(async (tx) => {
    await tx.entities.questions.update({ ...question, text: 'Changed question?' });
  });
  const pages = await readEavWiki(db);
  const embeds = pages[0]!.blocks[0]!.children.map((block) => block.embed!);
  expect(embeds.map((embed) => embed.mode)).toEqual(['live', 'pinned']);
  expect(
    renderToStaticMarkup(
      <WikiBlocks
        blocks={pages[0]!.blocks}
        onEvidence={() => undefined}
        renderRecord={(block) =>
          block.embed ? <Text>{block.embed.mode} owner view</Text> : undefined
        }
      />,
    ),
  ).toContain('live owner view');
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, embeds[0]!))).toContain(
    'Changed question?',
  );
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, embeds[1]!))).toContain(
    'Original question?',
  );
  const historical = (await readEavWiki(db, undefined, hostSnapshot))[0]!.blocks[0]!.children[0]!;
  expect(
    renderToStaticMarkup(await readEmbeddedRecord(db, historical.embed!, historical.embedCutoff)),
  ).toContain('Original question?');
  expect(
    (await projectedExchange(db, exchange, { includeEmbeds: false }))[0]!.embeds,
  ).toBeUndefined();
  const turns = await projectedExchange(db, exchange);
  expect(turns[0]!.embeds).toEqual(embeds);
  expect(
    renderToStaticMarkup(
      <ChatMessage
        turn={{
          role: 'user',
          at: '',
          parts: [{ kind: 'text', text: 'Discuss this' }],
          embeds: turns[0]!.embeds,
        }}
        renderEmbed={(embed) => <Text>{embed.mode} owner view</Text>}
      />,
    ),
  ).toContain('pinned owner view');
  const before = await db.history.transactions.query({ limit: null, select: {} });
  await readEmbeddedRecord(db, embeds[0]!);
  await readEavWiki(db);
  await projectedExchange(db, exchange);
  expect(await db.history.transactions.query({ limit: null, select: {} })).toHaveLength(
    before.length,
  );
  await db.transaction(async (tx) => {
    const current = (await tx.entities.questions.get(question, { select: {} }))!;
    await tx.entities.questions.update({ ...current, available: false });
  });
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, embeds[0]!))).toContain(
    'missing or has been removed',
  );
  expect(renderToStaticMarkup(await readEmbeddedRecord(db, embeds[1]!))).toContain(
    'Original question?',
  );
});

test('both host admissions reject forged target addresses atomically', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const { author, exchange } = await db.transaction(async (tx) => {
    const author = await tx.entities.actors.insert({ name: 'Owner', kind: 'user' });
    const conversation = await tx.entities.conversations.insert({ createdAt: new Date() });
    return { author, exchange: await tx.entities.exchanges.insert({ conversation, position: 0 }) };
  });
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = { ...(await db.history.reference(snapshot, exchange)), entity: 'missing' };
  const wiki = wikiActions(db, author);
  const page = await wiki.createPage({ key: 'page', title: 'Page', summary: '' });
  await expect(
    wiki.append('bad', { kind: 'embed', embedTarget: target }, { page, order: 'a' }),
  ).rejects.toThrow();
  await expect(appendExchangeEmbed(db, exchange, { target }, 0)).rejects.toThrow();
  expect(await db.entities.wikiContent.query({ select: {} })).toHaveLength(0);
  expect(await db.entities.exchangeEmbeds.query({ select: {} })).toHaveLength(0);
});

test('installed task, decision and observation owner views preserve pinned values after edits', async () => {
  await using db = await applicationDatabase(createMemoryStorage());
  const observationValue = {
    subject: 'host',
    source: { kind: 'application' },
    time: {},
    outcome: { status: 'failed', reason: 'Original collector failure', value: null },
  };
  const records = await db.transaction(async (tx) => ({
    task: await tx.entities.tasks.insert({
      title: 'Original task',
      description: '',
      status: 'backlog',
      available: true,
    }),
    decision: await tx.entities.decisions.insert({ text: 'Original decision', available: true }),
    observation: await tx.entities.observations.insert({
      value: observationValue,
      available: true,
    }),
  }));
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const targets = await Promise.all(
    Object.values(records).map((record) => db.history.reference(snapshot, record)),
  );
  await db.transaction(async (tx) => {
    await tx.entities.tasks.update({ ...records.task, title: 'Changed task' });
    await tx.entities.decisions.update({ ...records.decision, text: 'Changed decision' });
    await tx.entities.observations.update({
      ...records.observation,
      value: {
        ...observationValue,
        outcome: { ...observationValue.outcome, reason: 'Changed collector failure' },
      },
    });
  });
  for (const [index, label] of ['task', 'decision', 'collector failure'].entries()) {
    const target = targets[index]!;
    expect(renderToStaticMarkup(await readEmbeddedRecord(db, { target, mode: 'live' }))).toContain(
      `Changed ${label}`,
    );
    expect(
      renderToStaticMarkup(await readEmbeddedRecord(db, { target, mode: 'pinned' })),
    ).toContain(`Original ${label}`);
  }
});

import { expect, test } from 'vitest';
import { asSchema } from 'ai';
import { openDatabase } from '@/core/store/index.ts';
import { wikiSchema } from './records.ts';
import { wikiTools } from './tools.ts';
import { readEavWiki } from './pages.ts';

test('native Wiki tools expose model-readable input schemas including retained embed targets', async () => {
  await using db = await openDatabase({ schema: wikiSchema });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Writer', kind: 'agent' }),
  );
  const tools = wikiTools(db, { author, signal: new AbortController().signal });
  for (const definition of Object.values(tools)) {
    const schema = await asSchema<unknown>(definition.inputSchema).jsonSchema;
    expect(schema).toBeDefined();
  }
});

test('native Wiki tool actions publish EAV pages and enforce revoked admission without another store', async () => {
  await using db = await openDatabase({ schema: wikiSchema });
  const author = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Writer', kind: 'agent' }),
  );
  const abort = new AbortController();
  const tools = wikiTools(db, { author, signal: abort.signal });
  const options = { toolCallId: 'create', messages: [], context: {} };
  await tools.createWikiPage!.execute!(
    { key: 'native', title: 'Native page', summary: '' },
    options,
  );
  expect((await readEavWiki(db))[0]?.title).toBe('Native page');
  abort.abort();
  await expect(
    tools.createWikiPage!.execute!(
      { key: 'revoked', title: 'Revoked', summary: '' },
      { ...options, toolCallId: 'revoked' },
    ),
  ).rejects.toThrow();
  expect(await db.entities.wikiPages.query({ select: {} })).toHaveLength(1);
});

import { describe, expect, test } from 'vitest';
import {
  e,
  openDatabase,
  createMemoryStorage,
  sameEntity,
  clear,
  ConflictError,
  SchemaMismatchError,
  type Transaction,
  type EntityRef,
} from './index.ts';

const Conversation = e.entity('conversation', {
  title: e.string().key('conversation/title'),
  summary: e.string().optional(),
});
const Message = e.entity('message', {
  conversation: e.ref(Conversation),
  text: e.string(),
  sentAt: e.datetime(),
  tags: e.set(e.string()).optional(),
  related: e.set(e.ref(Conversation)).optional(),
});
const schema = e.registry({
  conversations: Conversation.extend({ messages: e.inverse(Message, 'conversation') }),
  messages: Message,
});
const day = (value: number) => new Date(Date.UTC(2026, 0, value));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/** Deliberately bypass the static interface to exercise validation of external inputs. */
function invoke(target: object, method: string, input: unknown): Promise<unknown> {
  return Promise.resolve().then(() => {
    const operation: unknown = Reflect.get(target, method);
    if (typeof operation !== 'function') throw new Error('Missing operation');
    return Reflect.apply(operation, target, [input]);
  });
}

describe('typed entity engine', () => {
  test('first returns a projected object or undefined, after filtering and ordering', async () => {
    await using db = await openDatabase({ schema });
    expect(await db.entities.messages.first({ select: { text: true } })).toBeUndefined();
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Travel' }),
    );
    await db.transaction(async (tx) => {
      await tx.entities.messages.insert({ conversation, text: 'Earlier', sentAt: day(1) });
      await tx.entities.messages.insert({ conversation, text: 'Later', sentAt: day(2) });
      await tx.entities.messages.insert({ conversation, text: 'Excluded', sentAt: day(3) });
    });
    const first = await db.entities.messages.first({
      where: {
        and: [{ conversation: { eq: conversation } }, { not: { text: { eq: 'Excluded' } } }],
      },
      select: { text: true, conversation: { title: true } },
      orderBy: [{ sentAt: 'desc' }],
    });
    expect(first).toMatchObject({ text: 'Later', conversation: { title: 'Travel' } });
    expect(Object.keys(first!)).toEqual(['text', 'conversation']);
    expect(sameEntity(first!.conversation, conversation)).toBe(true);
    expect(await db.entities.messages.query({ select: { text: true }, limit: 0 })).toEqual([]);
    await db.transaction((tx) => tx.entities.messages.update({ ...first!, text: 'Edited' }));
    expect(
      (
        await db.entities.messages.first({
          where: { text: { eq: 'Edited' } },
          select: { text: true },
        })
      )?.text,
    ).toBe('Edited');
  });

  test('identity is independent of contents, retained by projections and spreads, and never serialized as data', async () => {
    await using db = await openDatabase({ schema });
    const a = await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Same' }));
    const b = await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Same' }));
    expect(sameEntity(a, b)).toBe(false);
    expect(sameEntity(a, { ...a })).toBe(true);
    expect(JSON.stringify(a)).toBe('{"title":"Same"}');
    await db.transaction((tx) => tx.entities.conversations.update({ ...a, summary: 'New' }));
    const selected = await db.entities.conversations.first({
      where: { summary: { eq: 'New' } },
      select: {},
    });
    expect(sameEntity(a, selected)).toBe(true);
    await db.transaction((tx) => tx.entities.conversations.delete(selected!));
    expect(await db.entities.conversations.query({ select: { title: true } })).toHaveLength(1);
  });

  test('runtime admission rejects detached objects, other databases, invalid fields and wrong entity types', async () => {
    await using db = await openDatabase({ schema });
    await using other = await openDatabase({ schema });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Here' }),
    );
    const foreign = await other.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Elsewhere' }),
    );
    const invalid = [
      JSON.parse(JSON.stringify(conversation)),
      structuredClone(conversation),
      foreign,
      { title: 'Here' },
      'id',
    ];
    for (const value of invalid) {
      await expect(
        db.transaction((tx) => Reflect.apply(tx.entities.conversations.delete, undefined, [value])),
      ).rejects.toThrow('Expected an entity object');
    }
    await expect(
      db.transaction((tx) =>
        Reflect.apply(tx.entities.messages.insert, undefined, [
          { conversation, text: 3, sentAt: day(1) },
        ]),
      ),
    ).rejects.toThrow('Expected string');
    await expect(
      db.transaction((tx) => Reflect.apply(tx.entities.messages.delete, undefined, [conversation])),
    ).rejects.toThrow('Expected an entity object');
    expect(await db.history.transactions.query({ select: { sequence: true } })).toHaveLength(1);
  });

  test('references and inverse selections use the query snapshot and support relationship predicates', async () => {
    await using db = await openDatabase({ schema });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Travel' }),
    );
    await db.transaction(async (tx) => {
      await tx.entities.messages.insert({ conversation, text: 'Packing', sentAt: day(1) });
      await tx.entities.messages.insert({ conversation, text: 'Tickets', sentAt: day(2) });
    });
    const page = await db.entities.conversations.first({
      where: { messages: { some: { text: { eq: 'Packing' } } } },
      select: { title: true, messages: { text: true, conversation: { title: true } } },
    });
    expect(page?.messages.map((message) => message.text).sort()).toEqual(['Packing', 'Tickets']);
    expect(page?.messages.every((message) => sameEntity(page, message.conversation))).toBe(true);
    const related = await db.entities.messages.query({
      where: { conversation: { matches: { title: { contains: 'Trav' } } } },
      select: { text: true },
    });
    expect(related).toHaveLength(2);
  });

  test('optional attributes can be cleared and set membership retains empty versus absent through history', async () => {
    const storage = createMemoryStorage();
    await using db = await openDatabase({ schema, storage });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Travel', summary: 'Summary' }),
    );
    const message = await db.transaction((tx) =>
      tx.entities.messages.insert({
        conversation,
        text: 'Hello',
        sentAt: day(1),
        tags: ['a', 'a', 'b'],
        related: [conversation, conversation],
      }),
    );
    expect(message.tags).toEqual(['a', 'b']);
    expect(message.related).toHaveLength(1);
    await db.transaction((tx) =>
      tx.entities.messages.update({ ...message, tags: [], related: clear }),
    );
    const committed = await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
    });
    await db.transaction((tx) =>
      tx.entities.conversations.update({ ...conversation, summary: clear }),
    );
    const before = await db
      .at(committed!)
      .entities.messages.first({ select: { tags: true, related: true } });
    expect(before?.tags).toEqual([]);
    expect(before).not.toHaveProperty('related');
    expect(
      (await db.entities.conversations.first({ select: { summary: true } }))?.summary,
    ).toBeUndefined();
    const copied = storage.inspect();
    expect(
      copied.transactions
        .flatMap((transaction) => transaction.facts)
        .some((fact) => fact.attribute === 'message/tags' && !fact.added),
    ).toBe(true);
  });

  test('historical reads and before/after reference expansion use the correct transaction cutoff', async () => {
    await using db = await openDatabase({ schema });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Original' }),
    );
    const message = await db.transaction((tx) =>
      tx.entities.messages.insert({ conversation, text: 'Before', sentAt: day(1) }),
    );
    const original = await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
    });
    await db.transaction({ author: conversation, origin: message }, async (tx) => {
      await tx.entities.conversations.update({ ...conversation, title: 'Renamed' });
      await tx.entities.messages.update({ ...message, text: 'After' });
    });
    const change = await db.history.entities.messages.first({
      where: { entity: { eq: message } },
      orderBy: [{ sequence: 'desc' }],
      select: {
        transaction: { sequence: true },
        before: { text: true, conversation: { title: true } },
        after: { text: true, conversation: { title: true } },
      },
    });
    expect(change?.before).toMatchObject({ text: 'Before', conversation: { title: 'Original' } });
    expect(change?.after).toMatchObject({ text: 'After', conversation: { title: 'Renamed' } });
    expect(
      await db
        .at(original!)
        .entities.messages.first({ select: { text: true, conversation: { title: true } } }),
    ).toMatchObject({ text: 'Before', conversation: { title: 'Original' } });
    const latest = await db.history.transactions.first({
      select: { sequence: true, author: true, origin: true },
      orderBy: [{ sequence: 'desc' }],
    });
    expect(sameEntity(latest?.author, conversation)).toBe(true);
    expect(sameEntity(latest?.origin, message)).toBe(true);
    expect((await db.history.changes(latest!)).map((item) => item.type).sort()).toEqual([
      'conversations',
      'messages',
    ]);
  });

  test('callback failure aborts all changes and invalidates objects produced by that transaction', async () => {
    await using db = await openDatabase({ schema });
    let abandoned: EntityRef<typeof Conversation> | undefined;
    await expect(
      db.transaction(async (tx) => {
        abandoned = await tx.entities.conversations.insert({ title: 'Never accepted' });
        throw new Error('Stop');
      }),
    ).rejects.toThrow('Stop');
    expect(await db.entities.conversations.query({ select: {} })).toEqual([]);
    expect(await db.history.transactions.query({ select: { sequence: true } })).toEqual([]);
    await expect(
      db.transaction((tx) => tx.entities.conversations.delete(abandoned!)),
    ).rejects.toThrow('Expected an entity object');
  });

  test('a caught invalid write still prevents the transaction from committing earlier writes', async () => {
    await using db = await openDatabase({ schema });
    await expect(
      db.transaction(async (tx) => {
        await tx.entities.conversations.insert({ title: 'Valid' });
        await expect(
          Reflect.apply(tx.entities.conversations.insert, undefined, [{ title: 1 }]),
        ).rejects.toThrow();
      }),
    ).rejects.toThrow('failed operation');
    expect(await db.entities.conversations.query({ select: {} })).toEqual([]);
  });

  test('reads observe transaction writes and escaped transaction handles close after the callback', async () => {
    await using db = await openDatabase({ schema });
    let escaped: Transaction<typeof schema> | undefined;
    await db.transaction(async (tx) => {
      escaped = tx;
      const conversation = await tx.entities.conversations.insert({ title: 'Here' });
      const result = await tx.entities.conversations.first({ select: { title: true } });
      expect(sameEntity(conversation, result)).toBe(true);
      expect(await db.entities.conversations.first({ select: { title: true } })).toBeUndefined();
    });
    await expect(escaped!.entities.conversations.insert({ title: 'Late' })).rejects.toThrow(
      'closed',
    );
    await expect(escaped!.entities.conversations.first({ select: {} })).rejects.toThrow('closed');
  });

  test('concurrent transactions reject conflicting acceptance without replaying callbacks', async () => {
    const storage = createMemoryStorage();
    await using db = await openDatabase({ schema, storage });
    await using other = await openDatabase({ schema, storage });
    const entered = gate();
    const finish = gate();
    let attempts = 0;
    const first = db.transaction(async (tx) => {
      attempts++;
      await tx.entities.conversations.insert({ title: 'First' });
      entered.release();
      await finish.promise;
    });
    await entered.promise;
    await other.transaction((tx) => tx.entities.conversations.insert({ title: 'Second' }));
    finish.release();
    await expect(first).rejects.toBeInstanceOf(ConflictError);
    expect(attempts).toBe(1);
    expect(await db.entities.conversations.query({ select: { title: true } })).toMatchObject([
      { title: 'Second' },
    ]);
  });

  test('stale object updates fail and a current projection can be used to make a new change', async () => {
    await using db = await openDatabase({ schema });
    const old = await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Old' }));
    await db.transaction((tx) => tx.entities.conversations.update({ ...old, title: 'New' }));
    await expect(
      db.transaction((tx) => tx.entities.conversations.update({ ...old, title: 'Lost update' })),
    ).rejects.toBeInstanceOf(ConflictError);
    const current = await db.entities.conversations.first({ select: {} });
    await db.transaction((tx) =>
      tx.entities.conversations.update({ ...current!, title: 'Newest' }),
    );
    expect((await db.entities.conversations.first({ select: { title: true } }))?.title).toBe(
      'Newest',
    );
  });

  test('disposing the database closes admission without waiting for arbitrary callback work', async () => {
    const storage = createMemoryStorage();
    const db = await openDatabase({ schema, storage });
    const entered = gate();
    const finish = gate();
    const pending = db.transaction(async (tx) => {
      await tx.entities.conversations.insert({ title: 'Pending' });
      entered.release();
      await finish.promise;
    });
    await entered.promise;
    await db[Symbol.asyncDispose]();
    finish.release();
    await expect(pending).rejects.toThrow('closed');
    await expect(db.entities.conversations.first({ select: {} })).rejects.toThrow('closed');
    await using reopened = await openDatabase({ schema, storage });
    expect(await reopened.entities.conversations.first({ select: {} })).toBeUndefined();
  });

  test('net changes exclude intermediate edits and insert-then-delete work', async () => {
    await using db = await openDatabase({ schema });
    await db.transaction(async (tx) => {
      const temporary = await tx.entities.conversations.insert({ title: 'Temporary' });
      await tx.entities.conversations.delete(temporary);
    });
    expect(await db.history.transactions.query({ select: {} })).toEqual([]);
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Before' }),
    );
    await db.transaction(async (tx) => {
      await tx.entities.conversations.update({ ...conversation, title: 'Intermediate' });
      await tx.entities.conversations.update({ ...conversation, title: 'After' });
    });
    const history = await db.history.entities.conversations.query({
      select: { before: { title: true }, after: { title: true } },
    });
    expect(history).toMatchObject([
      { before: null, after: { title: 'Before' } },
      { before: { title: 'Before' }, after: { title: 'After' } },
    ]);
  });

  test('referential integrity is checked atomically, while deleted history remains queryable', async () => {
    await using db = await openDatabase({ schema });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Referenced' }),
    );
    const message = await db.transaction((tx) =>
      tx.entities.messages.insert({ conversation, text: 'Retained', sentAt: day(1) }),
    );
    await expect(
      db.transaction((tx) => tx.entities.conversations.delete(conversation)),
    ).rejects.toThrow('unavailable reference');
    await db.transaction(async (tx) => {
      await tx.entities.conversations.delete(conversation);
      await tx.entities.messages.delete(message);
    });
    expect(await db.entities.messages.first({ select: {} })).toBeUndefined();
    const last = await db.history.entities.messages.first({
      select: { before: { text: true, conversation: { title: true } }, after: {} },
      orderBy: [{ sequence: 'desc' }],
    });
    expect(last).toMatchObject({
      before: { text: 'Retained', conversation: { title: 'Referenced' } },
      after: null,
    });
  });

  test('cursor pagination retains stable ties without exposing IDs and refuses mixing snapshots', async () => {
    await using db = await openDatabase({ schema });
    await db.transaction(async (tx) => {
      await tx.entities.conversations.insert({ title: 'Same' });
      await tx.entities.conversations.insert({ title: 'Same' });
      await tx.entities.conversations.insert({ title: 'Same' });
    });
    const first = await db.entities.conversations.first({
      select: { title: true },
      orderBy: [{ title: 'asc' }],
    });
    const next = await db.entities.conversations.query({
      select: { title: true },
      orderBy: [{ title: 'asc' }],
      after: first!,
    });
    expect(next).toHaveLength(2);
    expect(next.some((value) => sameEntity(value, first))).toBe(false);
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Later' }));
    await expect(db.entities.conversations.query({ select: {}, after: first! })).rejects.toThrow(
      'same database snapshot',
    );
  });

  test('schema definitions are retained, compatible additions reopen, and incompatible changes do not mutate storage', async () => {
    const storage = createMemoryStorage();
    const original = e.registry({ conversations: Conversation });
    await using db = await openDatabase({ schema: original, storage });
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Stored' }));
    const expanded = e.registry({
      conversations: Conversation.extend({ note: e.string().optional() }),
    });
    await using reopened = await openDatabase({ schema: expanded, storage });
    expect((await reopened.schema.revisions()).map((revision) => revision.revision)).toEqual([
      1, 2,
    ]);
    expect(
      await reopened.entities.conversations.first({ select: { title: true, note: true } }),
    ).toMatchObject({ title: 'Stored' });
    await expect(db.entities.conversations.first({ select: {} })).rejects.toThrow('schema changed');
    const before = storage.inspect();
    const broken = e.registry({
      conversations: e.entity('conversation', {
        title: e.number().key('conversation/title'),
        summary: e.string().optional(),
        note: e.string().optional(),
      }),
    });
    await expect(openDatabase({ schema: broken, storage })).rejects.toBeInstanceOf(
      SchemaMismatchError,
    );
    expect(storage.inspect()).toEqual(before);
  });

  test('stable attribute identities allow property renaming without losing current or historical values', async () => {
    const storage = createMemoryStorage();
    await using db = await openDatabase({
      schema: e.registry({ conversations: Conversation }),
      storage,
    });
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Retained' }));
    const renamed = e.registry({
      conversations: e.entity('conversation', {
        name: e.string().key('conversation/title'),
        summary: e.string().optional(),
      }),
    });
    await using next = await openDatabase({ schema: renamed, storage });
    expect(await next.entities.conversations.first({ select: { name: true } })).toMatchObject({
      name: 'Retained',
    });
    expect(
      await next.history.entities.conversations.first({
        select: { after: { name: true }, transaction: { schemaRevision: true } },
      }),
    ).toMatchObject({ after: { name: 'Retained' }, transaction: { schemaRevision: 1 } });
  });

  test('invalid queries fail even for empty collections and first rejects a caller-supplied limit', async () => {
    await using db = await openDatabase({ schema });
    const invalid = [
      { select: { missing: true } },
      { select: { title: true }, where: { missing: { eq: 'x' } } },
      { select: { title: true }, limit: 10 },
      { select: { title: true }, orderBy: [{ title: 'sideways' }] },
    ];
    for (const query of invalid)
      await expect(invoke(db.entities.conversations, 'first', query)).rejects.toThrow();
  });

  test('observer failures do not change acceptance, and returned dates cannot mutate retained data', async () => {
    await using db = await openDatabase({ schema });
    const unsubscribe = db.subscribe(() => {
      throw new Error('Observer');
    });
    const conversation = await db.transaction((tx) =>
      tx.entities.conversations.insert({ title: 'Accepted' }),
    );
    unsubscribe();
    const message = await db.transaction((tx) =>
      tx.entities.messages.insert({ conversation, text: 'Dated', sentAt: day(1) }),
    );
    message.sentAt.setTime(0);
    expect((await db.entities.messages.first({ select: { sentAt: true } }))?.sentAt).toEqual(
      day(1),
    );
  });

  test('history pagination preserves its query cutoff independently of each transaction date', async () => {
    await using db = await openDatabase({ schema });
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'One' }));
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Two' }));
    await db.transaction((tx) => tx.entities.conversations.insert({ title: 'Three' }));
    const first = await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
    });
    const second = await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
      after: first!,
    });
    const third = await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
      after: second!,
    });
    expect([first?.sequence, second?.sequence, third?.sequence]).toEqual([3, 2, 1]);
  });

  test('publication observers cannot append work through the transaction being committed', async () => {
    await using db = await openDatabase({ schema });
    let captured: Transaction<typeof schema> | undefined;
    let late: Promise<unknown> | undefined;
    db.subscribe(() => {
      late = captured!.entities.conversations.insert({ title: 'Late' });
    });
    await db.transaction(async (tx) => {
      captured = tx;
      await tx.entities.conversations.insert({ title: 'Accepted' });
    });
    await expect(late).rejects.toThrow('closed');
    expect(await db.entities.conversations.query({ select: { title: true } })).toHaveLength(1);
  });

  test('registration rejects contradictory reference shapes and query operators work on enum text', async () => {
    const Contradictory = e.entity('conversation', { title: e.number().key('conversation/title') });
    expect(() => e.registry({ conversations: Contradictory, messages: Message })).toThrow(
      'Reference definition disagrees',
    );
    expect(() => e.registry({ bad: e.entity('@transaction', {}) })).toThrow('Reserved entity type');
    const Task = e.entity('task', { status: e.enum('open', 'closed') });
    await using db = await openDatabase({ schema: e.registry({ tasks: Task }) });
    await db.transaction((tx) => tx.entities.tasks.insert({ status: 'open' }));
    expect(
      (
        await db.entities.tasks.first({
          where: { status: { contains: 'op' } },
          select: { status: true },
        })
      )?.status,
    ).toBe('open');
  });
});

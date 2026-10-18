import { expect, test } from 'vitest';
import { e, openDatabase, sameEntity } from './index.ts';

test('generic historical inspection retains attribution, references and deletion boundaries', async () => {
  const Actor = e.entity('actor', { name: e.string() });
  const Note = e.entity('note', { text: e.string(), author: e.ref(Actor) });
  const schema = e.registry({ actors: Actor, notes: Note });
  await using db = await openDatabase({ schema });
  const actor = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Original author' }),
  );
  const first = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const note = await db.transaction({ author: actor }, (tx) =>
    tx.entities.notes.insert({ text: 'Retained words', author: actor }),
  );
  const second = (await db.history.transactions.first({
    select: { author: true },
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await db.transaction(async (tx) => {
    await tx.entities.actors.update({ ...actor, name: 'Renamed author' });
    await tx.entities.notes.delete(note);
  });
  const third = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  expect(await db.history.inspect(second, second.author!)).toMatchObject({
    type: 'actor',
    values: { name: 'Original author' },
  });
  const historical = await db.history.inspect(second, note);
  expect(historical).toMatchObject({ type: 'note', values: { text: 'Retained words' } });
  expect(sameEntity(historical!.values, note)).toBe(true);
  expect(sameEntity(historical!.values.author, actor)).toBe(true);
  expect(Object.isFrozen(historical!.values)).toBe(true);
  expect(await db.history.inspect(first, note)).toBeUndefined();
  expect(await db.history.inspect(third, note)).toBeUndefined();
  await using foreign = await openDatabase({ schema });
  await expect(foreign.history.inspect(second, actor)).rejects.toThrow();
  const other = await foreign.transaction((tx) => tx.entities.actors.insert({ name: 'Other' }));
  await expect(db.history.inspect(second, other)).rejects.toThrow();
});

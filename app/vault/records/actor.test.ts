import { expect, test } from 'vitest';
import { e, openDatabase, createMemoryStorage, sameEntity } from '@/vault/eav/index.ts';
import { Actor, ActorBinding, bindActor, readActorBinding } from './actor.ts';

const schema = e.registry({ actors: Actor, actorBindings: ActorBinding });

test('binding preserves identity and display name and rejects changing an account role', async () => {
  await using db = await openDatabase({ schema, storage: createMemoryStorage() });
  const first = await db.transaction((tx) => bindActor(tx, 'owner', 'user', 'Vault owner'));
  const again = await db.transaction((tx) => bindActor(tx, 'owner', 'user', 'Different name'));
  expect(sameEntity(first, again)).toBe(true);
  expect(again.name).toBe('Vault owner');
  await expect(db.transaction((tx) => bindActor(tx, 'owner', 'agent', 'Agent'))).rejects.toThrow(
    'incompatible actor kind',
  );
  await expect(readActorBinding(db, '', 'user')).rejects.toThrow('nonempty');
  expect(await db.entities.actors.query({ select: {} })).toHaveLength(1);
});

test('binding creation rolls back with its caller transaction', async () => {
  await using db = await openDatabase({ schema, storage: createMemoryStorage() });
  await expect(
    db.transaction(async (tx) => {
      await bindActor(tx, 'owner', 'user', 'Vault owner');
      throw new Error('Caller rejected admission');
    }),
  ).rejects.toThrow('Caller rejected admission');
  expect(await readActorBinding(db, 'owner', 'user')).toBeUndefined();
  expect(await db.entities.actors.query({ select: {} })).toEqual([]);
  expect(await db.history.transactions.query({ select: {} })).toEqual([]);
});

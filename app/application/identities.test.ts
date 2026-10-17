import { expect, test } from 'vitest';
import {
  createMemoryStorage,
  createPersistentStorage,
  sameEntity,
  type AppendRequest,
  type Journal,
} from '@/vault/eav/index.ts';
import { applicationDatabase } from './composition.ts';
import { createApplicationIdentities } from './identities.ts';

test('application identity setup is stable across callers and preserves Agent configuration', async () => {
  const storage = createMemoryStorage();
  const database = () => applicationDatabase(storage);
  const setup = createApplicationIdentities(database);
  await setup.ensure();
  const db = await database();
  const owner = (await db.entities.actorBindings.first({
    where: { key: { eq: setup.identities.user } },
    select: { actor: { kind: true } },
  }))!;
  expect(owner.actor.kind).toBe('user');
  const binding = (await db.entities.actorBindings.first({
    where: { key: { eq: setup.identities.agent } },
    select: { actor: true },
  }))!;
  const agent = await db.transaction((tx) =>
    tx.entities.agents.insert({
      actor: binding.actor,
      provider: 'fictional',
      model: 'fictional',
      instructions: '',
      settings: {},
      tools: [],
    }),
  );
  await db.transaction((tx) =>
    tx.entities.agents.update({ ...agent, instructions: 'Retain this configuration.' }),
  );
  await createApplicationIdentities(database).ensure();
  expect(await db.entities.agents.first({ select: { instructions: true } })).toMatchObject({
    instructions: 'Retain this configuration.',
  });
  const sameOwner = (await db.entities.actorBindings.first({
    where: { key: { eq: setup.identities.user } },
    select: { actor: true },
  }))!;
  expect(sameEntity(owner.actor, sameOwner.actor)).toBe(true);
  expect(await db.entities.actors.query({ select: {} })).toHaveLength(2);
});

test('identity bootstrap retries the same publication after an uncertain save', async () => {
  let journal: Journal = { schemas: [], commits: [] };
  const requests: AppendRequest[] = [];
  let loseResponse = true;
  const storage = createPersistentStorage({
    scope: 'identity-recovery',
    load: async () => structuredClone(journal),
    append: async (request) => {
      requests.push(structuredClone(request));
      if (!journal.commits.some((commit) => commit.id === request.commit.id))
        journal = structuredClone({
          schemas: request.schemas,
          commits: [...journal.commits, request.commit],
        });
      if (loseResponse) {
        loseResponse = false;
        throw new Error('Acknowledgement lost');
      }
    },
  });
  const setup = createApplicationIdentities(() => applicationDatabase(storage));
  await expect(setup.ensure()).rejects.toThrow('Acknowledgement lost');
  await setup.ensure();
  expect(requests[1]).toEqual(requests[0]);
  const db = await applicationDatabase(storage);
  expect(await db.entities.actorBindings.query({ select: {} })).toHaveLength(2);
  expect(journal.commits).toHaveLength(1);
});

test('application refuses an incompatible configured owner identity', async () => {
  const storage = createMemoryStorage();
  const db = await applicationDatabase(storage);
  await db.transaction(async (tx) => {
    const actor = await tx.entities.actors.insert({ name: 'System', kind: 'system' });
    await tx.entities.actorBindings.insert({ key: 'vaulter:owner', actor });
  });
  await expect(
    createApplicationIdentities(() => applicationDatabase(storage)).ensure(),
  ).rejects.toThrow();
});

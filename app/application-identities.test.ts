import { expect, test } from 'vitest';
import { memoryNodeBackend } from './vault/nodes/memory.ts';
import { createApplicationIdentities } from './application-identities.ts';

test('application identity setup is stable across callers and preserves migrated Agent configuration', async () => {
  const nodes = memoryNodeBackend();
  const setup = createApplicationIdentities(nodes);
  await setup.ensure();
  const ids = setup.identities;
  expect((await nodes.snapshot()).get(ids.user)?.data?.kind).toBe('actor');
  const agent = (await nodes.snapshot()).get(ids.agent)!;
  await nodes.commit({
    id: 'configured',
    kind: { scope: 'node', action: 'update' },
    recordedBy: ids.user,
    origin: null,
    undoOf: null,
    message: null,
    changes: [
      {
        node: ids.agent,
        expected: agent.key.transaction,
        placement: null,
        connection: null,
        data: { kind: 'agent', instructions: 'Retain this configuration.' },
      },
    ],
  });
  await createApplicationIdentities(nodes).ensure();
  expect((await nodes.snapshot()).get(ids.agent)?.data?.instructions).toBe(
    'Retain this configuration.',
  );
  expect(await nodes.history()).toHaveLength(2);
});

test('identity bootstrap retries a rejected request unchanged and never restores a deleted actor', async () => {
  const memory = memoryNodeBackend();
  const requests: unknown[] = [];
  let reject = true;
  const nodes = {
    ...memory,
    commit: async (request: Parameters<typeof memory.commit>[0]) => {
      requests.push(request);
      if (reject) throw new Error('Offline');
      return memory.commit(request);
    },
  };
  const setup = createApplicationIdentities(nodes);
  await expect(setup.ensure()).rejects.toThrow('Offline');
  reject = false;
  await setup.ensure();
  expect(requests[1]).toEqual(requests[0]);
  const actor = (await nodes.snapshot()).get(setup.identities.user)!;
  await memory.commit({
    id: 'delete-actor',
    kind: { scope: 'node', action: 'delete' },
    recordedBy: setup.identities.user,
    origin: null,
    undoOf: null,
    message: null,
    changes: [
      {
        node: actor.key.node,
        expected: actor.key.transaction,
        placement: null,
        connection: null,
        data: null,
      },
    ],
  });
  await expect(createApplicationIdentities(nodes).ensure()).rejects.toThrow(
    'deleted or has an incompatible kind',
  );
});

// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useSession, type Session } from './session.ts';
import { memoryNodeBackend } from '../nodes/memory.ts';
import type { NodeBackend } from '../nodes/store.ts';
import {
  rememberedCredentials,
  saveSecretOverrides,
  unlockCredentials,
  forget,
  type Credentials,
} from './unlock.ts';
import type { Secrets } from './sealed.ts';
import { create, seed } from '../nodes/fixtures.test-support.ts';
import { nodeOperations } from '../nodes/operations.ts';
import { PreparationReplaced, WriteClosed } from '../transactions/lifetime.ts';

vi.mock('./unlock.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./unlock.ts')>()),
  rememberedCredentials: vi.fn(),
  saveSecretOverrides: vi.fn(),
  forget: vi.fn(),
  unlockCredentials: vi.fn(),
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount();
    await Promise.resolve();
  });
  roots.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function open(
  nodes: NodeBackend,
  options: {
    secrets?: Secrets;
    openNodes?: (secrets: Secrets) => NodeBackend;
    credentials?: Credentials | null;
    response?: Response;
  } = {},
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(options.response ?? new Response('{}')));
  const secrets = options.secrets ?? { github: 'fictional-token' };
  vi.mocked(rememberedCredentials).mockResolvedValue(
    options.credentials === undefined
      ? { preloadedSecrets: secrets, secretOverrides: {}, secrets }
      : options.credentials,
  );
  vi.mocked(saveSecretOverrides).mockResolvedValue();
  const factory = vi.fn(({ secrets: credentials }: { secrets: Secrets }) =>
    options.openNodes ? options.openNodes(credentials) : nodes,
  );
  let session!: Session;
  function Probe() {
    session = useSession(factory);
    return null;
  }
  const root = createRoot(document.body);
  roots.push(root);
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  return { session: () => session, factory, root };
}

test('unlocked session injects credentials, loads cache before remote refresh, and closes on unmount', async () => {
  const nodes = memoryNodeBackend();
  const order: string[] = [];
  vi.spyOn(nodes, 'cached').mockImplementation(() => {
    order.push('cached');
    return Promise.resolve(true);
  });
  vi.spyOn(nodes, 'refresh').mockImplementation(() => {
    order.push('refresh');
    return Promise.resolve();
  });
  const close = vi.spyOn(nodes, 'close');
  const { session, factory, root } = await open(nodes);
  expect(factory).toHaveBeenCalledWith({ secrets: { github: 'fictional-token' } });
  expect(order).toEqual(['cached', 'refresh']);
  expect(session().nodes).not.toHaveProperty('commit');
  const snapshot = vi.spyOn(nodes, 'snapshot');
  await session().nodes!.snapshot();
  expect(snapshot).toHaveBeenCalledOnce();
  expect(session().nodeStatus.kind).toBe('synced');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  expect(close).toHaveBeenCalled();
});

test('node persistence failure exposes an error while cached data remains available', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'refresh').mockRejectedValue(new Error('GitHub unavailable'));
  const { session } = await open(nodes);
  expect(session().nodeStatus.kind).toBe('error');
  expect(session().ready).toBe(true);
});

test('sign out forgets credentials and clears the node cache before closing it', async () => {
  const nodes = memoryNodeBackend();
  const order: string[] = [];
  vi.spyOn(nodes, 'clear').mockImplementation(() => {
    order.push('clear');
    return Promise.resolve();
  });
  vi.spyOn(nodes, 'close').mockImplementation(() => {
    order.push('close');
  });
  vi.mocked(forget).mockImplementation(() => {
    order.push('forget');
    return Promise.resolve();
  });
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  const { session } = await open(nodes);
  await act(async () => {
    await session().signOut!();
  });
  expect(order).toEqual(['clear', 'forget', 'close']);
  expect(session().secrets).toBeNull();
  expect(session().nodes).toBeNull();
});

test('visible sessions periodically refresh shared nodes and expose manual refresh', async () => {
  const nodes = memoryNodeBackend();
  const refresh = vi.spyOn(nodes, 'refresh');
  const timers = vi.spyOn(globalThis, 'setInterval');
  const { session } = await open(nodes);
  const callback = timers.mock.calls.find(([, interval]) => interval === 30_000)?.[0];
  expect(callback).toBeTypeOf('function');
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => {
    if (typeof callback === 'function') callback();
    await Promise.resolve();
  });
  expect(refresh).toHaveBeenCalledTimes(2);
  await act(async () => {
    await session().refreshNodes();
  });
  expect(refresh).toHaveBeenCalledTimes(3);
});

test('credential changes persist before use, retain storage, and restore preloaded defaults', async () => {
  const nodes = memoryNodeBackend();
  const { session, factory } = await open(nodes, {
    secrets: { github: 'fictional-token', openai: 'preloaded-key' },
  });
  expect(session().credentialPending).toBe(false);
  expect(session().credentials.openai.persistent).toBe(true);
  expect(session().credentials.openai.configured).toBe(true);
  expect(session().credentials.openai.overridden).toBe(false);
  expect(session().credentials.github.clear).toBeUndefined();
  let release!: () => void;
  vi.mocked(saveSecretOverrides).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let updating!: Promise<void>;
  await act(async () => {
    updating = session().credentials.openai.save('device-key');
    await Promise.resolve();
  });
  expect(session().credentialPending).toBe(true);
  expect(session().credentials.openai.disabledReason).toContain('being updated');
  expect(session().secrets?.openai).toBe('preloaded-key');
  await act(async () => {
    release();
    await updating;
  });
  expect(session().credentialPending).toBe(false);
  expect(session().secrets?.openai).toBe('device-key');
  expect(session().secretOverrides).toEqual({ openai: 'device-key' });
  expect(session().credentials.openai.overridden).toBe(true);
  expect(factory).toHaveBeenCalledTimes(1);

  await act(async () => session().credentials.openai.clear!());
  expect(session().credentials.openai.configured).toBe(false);
  expect(session().credentials.openai.overridden).toBe(true);
  await act(async () => session().credentials.openai.restore());
  expect(session().secrets?.openai).toBe('preloaded-key');
  expect(session().credentials.openai.overridden).toBe(false);
  expect(session().secretOverrides).toEqual({});
});

test('failed credential persistence and invalid GitHub changes leave the active session unchanged', async () => {
  const nodes = memoryNodeBackend();
  const { session, factory } = await open(nodes);
  vi.mocked(saveSecretOverrides).mockRejectedValueOnce(new Error('Device storage unavailable'));
  await act(async () => {
    await expect(session().updateSecret('openai', 'device-key')).rejects.toThrow('Device storage');
  });
  expect(session().secretOverrides).toEqual({});
  expect(session().secrets).toEqual({ github: 'fictional-token' });
  expect(session().credentialPending).toBe(false);
  await expect(session().updateSecret('github', null)).rejects.toThrow('GitHub token');
  await expect(session().updateSecret('github', ' ')).rejects.toThrow('GitHub token');
  expect(factory).toHaveBeenCalledTimes(1);
});

test('queued credential changes keep the session pending until every edit finishes', async () => {
  const { session } = await open(memoryNodeBackend());
  const releases: (() => void)[] = [];
  vi.mocked(saveSecretOverrides).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        releases.push(resolve);
      }),
  );
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = session().updateSecret('openai', 'first-key');
    second = session().updateSecret('openai', 'second-key');
    await Promise.resolve();
  });
  expect(session().credentialPending).toBe(true);
  await act(async () => {
    releases[0]!();
    await first;
  });
  expect(session().credentialPending).toBe(true);
  expect(session().secrets?.openai).toBe('first-key');
  await act(async () => {
    releases[1]!();
    await second;
  });
  expect(session().credentialPending).toBe(false);
  expect(session().secrets?.openai).toBe('second-key');
});

test('retained safe credential handles reject pending updates and closed Session generations', async () => {
  const { session, root } = await open(memoryNodeBackend());
  const credential = session().credentials.openai;
  let release!: () => void;
  vi.mocked(saveSecretOverrides).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let saving!: Promise<void>;
  await act(async () => {
    saving = credential.save('first-key');
    await expect(credential.save('duplicate-key')).rejects.toThrow('being updated');
  });
  expect(saveSecretOverrides).toHaveBeenCalledTimes(1);
  await act(async () => {
    release();
    await saving;
  });
  await act(async () => credential.restore());
  expect(session().credentials.openai.configured).toBe(false);
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  await expect(credential.save('late-key')).rejects.toThrow('session has closed');
  expect(saveSecretOverrides).toHaveBeenCalledTimes(2);
});

test('GitHub replacement preserves the open vault while preparing and ignores old refresh results', async () => {
  const nodes = memoryNodeBackend();
  const replacementNodes = memoryNodeBackend();

  const closedNodes = vi.spyOn(nodes, 'close');
  const { session } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? replacementNodes : nodes),
  });
  const { identity } = session();
  const originalNodes = session().nodes;

  let releaseOld!: () => void;
  vi.spyOn(nodes, 'refresh').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseOld = resolve;
      }),
  );
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 30_001);
  await act(async () => {
    dispatchEvent(new Event('online'));
    await Promise.resolve();
  });
  let releaseReplacement!: () => void;
  vi.spyOn(replacementNodes, 'refresh').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseReplacement = resolve;
      }),
  );
  let updating!: Promise<void>;
  await act(async () => {
    updating = session().updateSecret('github', 'replacement-token');
    await Promise.resolve();
  });
  expect(session().nodes).toBe(originalNodes);
  expect(session().credentialPending).toBe(true);
  expect(session().identity).toBe(identity);

  expect(session().secrets?.github).toBe('fictional-token');
  await act(async () => {
    releaseReplacement();
    await updating;
  });
  expect(session().nodes).not.toBe(originalNodes);
  expect(session().nodes?.identity).toBe(originalNodes?.identity);
  const snapshot = vi.spyOn(replacementNodes, 'snapshot');
  await originalNodes!.snapshot();
  expect(snapshot).toHaveBeenCalledOnce();
  expect(session().credentialPending).toBe(false);
  expect(session().identity).toBe(identity);

  expect(closedNodes).toHaveBeenCalledTimes(1);

  await act(async () => {
    releaseOld();

    await Promise.resolve();
  });

  expect(session().nodeStatus.kind).toBe('synced');
});

test('replacement invalidates preparation before React updates and retires the old adapter after entered writes settle', async () => {
  const nodes = memoryNodeBackend();
  const replacement = memoryNodeBackend();
  await seed(nodes);
  await seed(replacement);
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finishCalculation!: () => void;
  const calculating = new Promise<void>((resolve) => {
    finishCalculation = resolve;
  });
  const commit = nodes.commit;
  vi.spyOn(nodes, 'commit').mockImplementation(async (request, publication) => {
    enter();
    await held;
    return commit(request, publication);
  });
  const close = vi.spyOn(nodes, 'close');
  const { session } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? replacement : nodes),
  });
  const original = session().nodes!;
  using writes = original.writer({ recordedBy: 'user', origin: null }).lifetime();
  const accepted = writes.write(() => ({
    value: 'entered',
    transaction: {
      kind: nodeOperations.create,
      message: null,
      undoOf: null,
      changes: [create('entered', { kind: 'content' })],
    },
  }));
  await entered;
  const unfinished = writes.prepare(async () => {
    await calculating;
    return {
      value: 'late',
      transaction: {
        kind: nodeOperations.create,
        message: null,
        undoOf: null,
        changes: [create('late', { kind: 'content' })],
      },
    };
  });
  let invalidatedBeforeRender = false;
  const unsubscribe = original.subscribe(() => {
    if (unfinished.snapshot().phase === 'rejected')
      invalidatedBeforeRender = session().nodes === original;
  });
  try {
    await act(async () => session().updateSecret('github', 'replacement-token'));
    expect(invalidatedBeforeRender).toBe(true);
    expect(session().nodes).not.toBe(original);
    expect(session().nodes!.identity).toBe(original.identity);
    await expect(unfinished.ready).rejects.toBeInstanceOf(PreparationReplaced);
    expect(close).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await accepted.result;
    });
    expect(accepted.snapshot().phase).toBe('accepted');
    expect(close).toHaveBeenCalledOnce();
    finishCalculation();
    expect((await replacement.snapshot()).get('late')).toBeUndefined();
  } finally {
    unsubscribe();
    release();
    finishCalculation();
    await accepted.result;
  }
});

test('sign-out closes new writes and retry immediately, then drains persistence before clearing and reloading', async () => {
  const nodes = memoryNodeBackend();
  await seed(nodes);
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const commit = nodes.commit;
  vi.spyOn(nodes, 'commit').mockImplementation(async (request, publication) => {
    enter();
    await held;
    return commit(request, publication);
  });
  const clear = vi.spyOn(nodes, 'clear');
  const close = vi.spyOn(nodes, 'close');
  const reload = vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  vi.mocked(forget).mockResolvedValue();
  const { session } = await open(nodes);
  const managed = session().nodes!;
  using writes = managed.writer({ recordedBy: 'user', origin: null }).lifetime();
  const calculate = () => ({
    value: undefined,
    transaction: {
      kind: nodeOperations.create,
      message: null,
      undoOf: null,
      changes: [create('entered', { kind: 'content' })],
    },
  });
  const request = writes.write(calculate);
  await entered;
  const prepared = writes.prepare(calculate);
  let ending!: Promise<void>;
  try {
    await act(async () => {
      ending = session().signOut!();
      expect(() => writes.write(calculate)).toThrow(WriteClosed);
      using recovery = managed.writer({ recordedBy: 'user', origin: null }).lifetime();
      await expect(recovery.retry(prepared)).rejects.toBeInstanceOf(WriteClosed);
    });
    expect(clear).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(forget).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(request.snapshot().phase).toBe('publishing');
    await act(async () => {
      release();
      await ending;
    });
    expect(request.snapshot().phase).toBe('accepted');
    expect(clear).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(forget).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(session().nodes).toBeNull();
  } finally {
    release();
    await ending;
  }
});

test('failed GitHub replacement retains the previous adapters and never saves rejected credentials', async () => {
  const nodes = memoryNodeBackend();
  const replacementNodes = memoryNodeBackend();

  vi.spyOn(replacementNodes, 'refresh').mockRejectedValue(new Error('Replacement rejected'));
  const closedCandidate = vi.spyOn(replacementNodes, 'close');
  const { session } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? replacementNodes : nodes),
  });

  const originalNodes = session().nodes;
  await act(async () => {
    await expect(session().updateSecret('github', 'replacement-token')).rejects.toThrow(
      'Replacement rejected',
    );
  });

  expect(session().nodes).toBe(originalNodes);

  expect(session().secrets?.github).toBe('fictional-token');
  expect(session().secretOverrides).toEqual({});
  expect(closedCandidate).toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('failed persistence after preparing GitHub replacement closes candidates and preserves the session', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();

  const closeNodes = vi.spyOn(candidate, 'close');
  const { session } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? candidate : nodes),
  });
  const originalNodes = session().nodes;
  vi.mocked(saveSecretOverrides).mockRejectedValueOnce(new Error('Device storage full'));
  await act(async () => {
    await expect(session().updateSecret('github', 'replacement-token')).rejects.toThrow(
      'Device storage full',
    );
  });

  expect(session().nodes).toBe(originalNodes);
  expect(session().secrets?.github).toBe('fictional-token');

  expect(closeNodes).toHaveBeenCalledOnce();
});

test('sign out is terminal while a replacement waits for its cache and rejects queued edits', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();

  const closeNodes = vi.spyOn(candidate, 'close');

  const refreshNodes = vi.spyOn(candidate, 'refresh');
  let releaseNodes!: () => void;
  vi.spyOn(candidate, 'cached').mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        releaseNodes = () => resolve(true);
      }),
  );
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  const { session } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? candidate : nodes),
  });
  const previous = session();
  let updating!: Promise<void>;
  let queued!: Promise<void>;
  await act(async () => {
    updating = previous.updateSecret('github', 'replacement-token');
    queued = previous.updateSecret('openai', 'queued-key');
    await Promise.resolve();
  });
  const updateRejected = expect(updating).rejects.toThrow('session has closed');
  const queuedRejected = expect(queued).rejects.toThrow('session has closed');
  await act(async () => {
    await previous.signOut!();
    await Promise.all([updateRejected, queuedRejected]);
  });
  expect(session().secrets).toBeNull();

  expect(closeNodes).toHaveBeenCalledOnce();
  expect(forget).toHaveBeenCalledOnce();
  await expect(previous.updateSecret('openai', 'later-key')).rejects.toThrow('session has closed');
  await act(async () => {
    releaseNodes();
    await Promise.resolve();
  });

  expect(refreshNodes).not.toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('unmount closes pending replacement adapters before they finish loading cache', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();

  const closeNodes = vi.spyOn(candidate, 'close');

  const refreshNodes = vi.spyOn(candidate, 'refresh');
  let release!: () => void;
  vi.spyOn(candidate, 'cached').mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        release = () => resolve(true);
      }),
  );
  const { session, root } = await open(nodes, {
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? candidate : nodes),
  });
  let updating!: Promise<void>;
  await act(async () => {
    updating = session().updateSecret('github', 'replacement-token');
    await Promise.resolve();
  });
  const rejected = expect(updating).rejects.toThrow('session has closed');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  await rejected;

  expect(closeNodes).toHaveBeenCalledOnce();
  release();
  await Promise.resolve();

  expect(refreshNodes).not.toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('unmount during secrets JSON parsing never reads remembered credentials', async () => {
  const response = new Response('{}');
  let release!: () => void;
  vi.spyOn(response, 'json').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({});
      }),
  );
  const { root } = await open(memoryNodeBackend(), { response });
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  release();
  await Promise.resolve();
  expect(rememberedCredentials).not.toHaveBeenCalled();
});

test('an unlock completing after unmount cannot open adapters', async () => {
  let release!: () => void;
  vi.mocked(unlockCredentials).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            preloadedSecrets: { github: 'fictional-token' },
            secretOverrides: {},
            secrets: { github: 'fictional-token' },
          });
      }),
  );
  const { session, root, factory } = await open(memoryNodeBackend(), {
    credentials: null,
  });
  const unlocking = session().locked!.unlock('password');
  const rejected = expect(unlocking).rejects.toThrow('session has closed');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  release();
  await rejected;

  expect(factory).not.toHaveBeenCalled();
});

test('cache clearing failure still forgets credentials and closes the signed-out adapters', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'clear').mockRejectedValueOnce(new Error('Cache unavailable'));
  const closeNodes = vi.spyOn(nodes, 'close');
  const { session } = await open(nodes);
  const previous = session();
  await act(async () => {
    await expect(previous.signOut!()).rejects.toThrow('Cache unavailable');
  });
  expect(forget).toHaveBeenCalledOnce();
  expect(closeNodes).toHaveBeenCalledOnce();
  expect(session().secrets).toBeNull();
  expect(session().nodeStatus).toEqual({
    kind: 'error',
    message: 'Sign-out could not finish: Error: Cache unavailable',
  });
  await expect(previous.updateSecret('openai', 'later-key')).rejects.toThrow('session has closed');
});

test('a cold node session waits for remote acceptance and admits an empty vault', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'cached').mockResolvedValue(false);
  let release!: () => void;
  vi.spyOn(nodes, 'refresh').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const { session } = await open(nodes);
  expect(session().ready).toBe(false);
  expect(session().nodeStatus.kind).toBe('syncing');
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(session().ready).toBe(true);
  expect(session().nodeStatus.kind).toBe('synced');
  expect((await session().nodes!.snapshot()).sequence).toBe(0);
});

test('a cold node failure cannot present an empty vault as accepted data', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'cached').mockResolvedValue(false);
  vi.spyOn(nodes, 'refresh').mockRejectedValue(new Error('Node history unavailable'));
  const { session } = await open(nodes);
  expect(session().ready).toBe(false);
  expect(session().nodeStatus).toMatchObject({
    kind: 'error',
    message: expect.stringContaining('Node history unavailable'),
  });
});

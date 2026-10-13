// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useSession, type Session } from './session.ts';
import { memoryBackend } from '../storage/memory.ts';
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
import type { VaultBackend } from '../storage/backend.ts';

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
    openBackend?: (secrets: Secrets) => VaultBackend;
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
  const fileFactory = vi.fn(({ secrets: credentials }: { secrets: Secrets }) =>
    options.openBackend ? options.openBackend(credentials) : memoryBackend({}).backend,
  );
  let session!: Session;
  function Probe() {
    session = useSession(fileFactory, () => true, factory);
    return null;
  }
  const root = createRoot(document.body);
  roots.push(root);
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  return { session: () => session, factory, fileFactory, root };
}

test('unlocked session injects credentials, loads cache before remote refresh, and closes on unmount', async () => {
  const nodes = memoryNodeBackend();
  const order: string[] = [];
  vi.spyOn(nodes, 'cached').mockImplementation(() => {
    order.push('cached');
    return Promise.resolve();
  });
  vi.spyOn(nodes, 'refresh').mockImplementation(() => {
    order.push('refresh');
    return Promise.resolve();
  });
  const close = vi.spyOn(nodes, 'close');
  const { session, factory, root } = await open(nodes);
  expect(factory).toHaveBeenCalledWith({ secrets: { github: 'fictional-token' } });
  expect(order).toEqual(['cached', 'refresh']);
  expect(session().nodes).toBe(nodes);
  expect(session().nodeStatus.kind).toBe('synced');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  expect(close).toHaveBeenCalled();
});

test('node persistence failure stays separate from the legacy file session', async () => {
  const nodes = memoryNodeBackend();
  vi.spyOn(nodes, 'refresh').mockRejectedValue(new Error('GitHub unavailable'));
  const { session } = await open(nodes);
  expect(session().status.kind).toBe('synced');
  expect(session().nodeStatus.kind).toBe('error');
  expect(session().head).not.toBeNull();
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
  expect(session().head).toBeNull();
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
  const { session, factory, fileFactory } = await open(nodes, {
    secrets: { github: 'fictional-token', openai: 'preloaded-key', jina: 'preloaded-jina' },
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
  expect(fileFactory).toHaveBeenCalledTimes(1);
  await act(async () => session().credentials.jina.clear!());
  expect(session().secrets?.jina).toBeUndefined();
  expect(session().credentials.jina.configured).toBe(false);
  expect(session().credentials.jina.overridden).toBe(true);
  await act(async () => session().credentials.openai.restore());
  expect(session().secrets?.openai).toBe('preloaded-key');
  expect(session().credentials.openai.overridden).toBe(false);
  expect(session().secretOverrides).toEqual({ jina: null });
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
    second = session().updateSecret('jina', 'second-key');
    await Promise.resolve();
  });
  expect(session().credentialPending).toBe(true);
  await act(async () => {
    releases[0]!();
    await first;
  });
  expect(session().credentialPending).toBe(true);
  expect(session().secrets?.openai).toBe('first-key');
  expect(session().secrets?.jina).toBeUndefined();
  await act(async () => {
    releases[1]!();
    await second;
  });
  expect(session().credentialPending).toBe(false);
  expect(session().secrets?.jina).toBe('second-key');
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
  const files = memoryBackend({}).backend;
  const replacementFiles = memoryBackend({}).backend;
  const closed = vi.fn();
  files.close = closed;
  const closedNodes = vi.spyOn(nodes, 'close');
  const { session } = await open(nodes, {
    openBackend: (secrets) => (secrets.github === 'replacement-token' ? replacementFiles : files),
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? replacementNodes : nodes),
  });
  const { identity } = session();
  const originalHead = session().head;
  const oldSetHead = session().setHead;
  let releaseOld!: (head: NonNullable<Session['head']>) => void;
  vi.spyOn(files, 'refresh').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
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
  expect(session().nodes).toBe(nodes);
  expect(session().credentialPending).toBe(true);
  expect(session().identity).toBe(identity);
  expect(session().head).toBe(originalHead);
  expect(session().secrets?.github).toBe('fictional-token');
  await act(async () => {
    releaseReplacement();
    await updating;
  });
  expect(session().nodes).toBe(replacementNodes);
  expect(session().credentialPending).toBe(false);
  expect(session().identity).toBe(identity);
  expect(session().backend).toBe(replacementFiles);
  expect(session().head).not.toBeNull();
  expect(closed).toHaveBeenCalledTimes(1);
  expect(closedNodes).toHaveBeenCalledTimes(1);
  const replacementHead = session().head;
  await act(async () => {
    releaseOld({ files: [], version: 'stale-refresh' });
    oldSetHead({ files: [], version: 'stale-write' });
    await Promise.resolve();
  });
  expect(session().head).toBe(replacementHead);
  expect(session().status.kind).toBe('synced');
});

test('failed GitHub replacement retains the previous adapters and never saves rejected credentials', async () => {
  const nodes = memoryNodeBackend();
  const replacementNodes = memoryNodeBackend();
  const files = memoryBackend({}).backend;
  const replacementFiles = memoryBackend({}).backend;
  vi.spyOn(replacementNodes, 'refresh').mockRejectedValue(new Error('Replacement rejected'));
  const closedCandidate = vi.spyOn(replacementNodes, 'close');
  const { session } = await open(nodes, {
    openBackend: (secrets) => (secrets.github === 'replacement-token' ? replacementFiles : files),
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? replacementNodes : nodes),
  });
  const originalHead = session().head;
  await act(async () => {
    await expect(session().updateSecret('github', 'replacement-token')).rejects.toThrow(
      'Replacement rejected',
    );
  });
  expect(session().backend).toBe(files);
  expect(session().nodes).toBe(nodes);
  expect(session().head).toBe(originalHead);
  expect(session().secrets?.github).toBe('fictional-token');
  expect(session().secretOverrides).toEqual({});
  expect(closedCandidate).toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('failed persistence after preparing GitHub replacement closes candidates and preserves the session', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();
  const files = memoryBackend({}).backend;
  const replacement = memoryBackend({}).backend;
  const closeFiles = vi.fn();
  replacement.close = closeFiles;
  const closeNodes = vi.spyOn(candidate, 'close');
  const { session } = await open(nodes, {
    openBackend: (secrets) => (secrets.github === 'replacement-token' ? replacement : files),
    openNodes: (secrets) => (secrets.github === 'replacement-token' ? candidate : nodes),
  });
  vi.mocked(saveSecretOverrides).mockRejectedValueOnce(new Error('Device storage full'));
  await act(async () => {
    await expect(session().updateSecret('github', 'replacement-token')).rejects.toThrow(
      'Device storage full',
    );
  });
  expect(session().backend).toBe(files);
  expect(session().nodes).toBe(nodes);
  expect(session().secrets?.github).toBe('fictional-token');
  expect(closeFiles).toHaveBeenCalledOnce();
  expect(closeNodes).toHaveBeenCalledOnce();
});

test('sign out is terminal while a replacement waits for its cache and rejects queued edits', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();
  const files = memoryBackend({}).backend;
  const replacement = memoryBackend({}).backend;
  const closeFiles = vi.fn();
  replacement.close = closeFiles;
  const closeNodes = vi.spyOn(candidate, 'close');
  const refreshFiles = vi.spyOn(replacement, 'refresh');
  const refreshNodes = vi.spyOn(candidate, 'refresh');
  let releaseFiles!: () => void;
  let releaseNodes!: () => void;
  vi.spyOn(replacement, 'cached').mockImplementationOnce(
    () =>
      new Promise<null>((resolve) => {
        releaseFiles = () => resolve(null);
      }),
  );
  vi.spyOn(candidate, 'cached').mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        releaseNodes = resolve;
      }),
  );
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  const { session } = await open(nodes, {
    openBackend: (secrets) => (secrets.github === 'replacement-token' ? replacement : files),
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
    previous.setHead({ files: [], version: 'late-write' });
  });
  expect(session().secrets).toBeNull();
  expect(session().head).toBeNull();
  expect(closeFiles).toHaveBeenCalledOnce();
  expect(closeNodes).toHaveBeenCalledOnce();
  expect(forget).toHaveBeenCalledOnce();
  await expect(previous.updateSecret('jina', 'later-key')).rejects.toThrow('session has closed');
  await act(async () => {
    releaseFiles();
    releaseNodes();
    await Promise.resolve();
  });
  expect(refreshFiles).not.toHaveBeenCalled();
  expect(refreshNodes).not.toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('unmount closes pending replacement adapters before they finish loading cache', async () => {
  const nodes = memoryNodeBackend();
  const candidate = memoryNodeBackend();
  const replacement = memoryBackend({}).backend;
  const closeFiles = vi.fn();
  replacement.close = closeFiles;
  const closeNodes = vi.spyOn(candidate, 'close');
  const refreshFiles = vi.spyOn(replacement, 'refresh');
  let release!: () => void;
  vi.spyOn(replacement, 'cached').mockImplementationOnce(
    () =>
      new Promise<null>((resolve) => {
        release = () => resolve(null);
      }),
  );
  const { session, root } = await open(nodes, {
    openBackend: (secrets) =>
      secrets.github === 'replacement-token' ? replacement : memoryBackend({}).backend,
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
  expect(closeFiles).toHaveBeenCalledOnce();
  expect(closeNodes).toHaveBeenCalledOnce();
  release();
  await Promise.resolve();
  expect(refreshFiles).not.toHaveBeenCalled();
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
  const { root, fileFactory } = await open(memoryNodeBackend(), { response });
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  release();
  await Promise.resolve();
  expect(rememberedCredentials).not.toHaveBeenCalled();
  expect(fileFactory).not.toHaveBeenCalled();
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
  const { session, root, fileFactory, factory } = await open(memoryNodeBackend(), {
    credentials: null,
  });
  const unlocking = session().locked!.unlock('password');
  const rejected = expect(unlocking).rejects.toThrow('session has closed');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  release();
  await rejected;
  expect(fileFactory).not.toHaveBeenCalled();
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
  expect(session().status).toEqual({
    kind: 'error',
    message: 'Sign-out could not finish: Error: Cache unavailable',
  });
  await expect(previous.updateSecret('openai', 'later-key')).rejects.toThrow('session has closed');
});

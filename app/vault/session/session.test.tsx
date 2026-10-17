// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { useSession, type Session } from './session.ts';
import {
  rememberedCredentials,
  saveSecretOverrides,
  unlockCredentials,
  forget,
  type Credentials,
} from './unlock.ts';
import type { Secrets } from './sealed.ts';
import {
  createPersistentStorage,
  e,
  openDatabase,
  SaveError,
  type StorageAdapter,
  type Transaction,
} from '@/vault/eav/index.ts';
import type { OpenEav } from './adapters.ts';

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
const empty = { commits: [], schemas: [] };
function fixture(overrides: Partial<StorageAdapter> = {}) {
  const adapter: StorageAdapter = {
    scope: crypto.randomUUID(),
    cached: vi.fn(async () => empty),
    load: vi.fn(async () => empty),
    append: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
    close: vi.fn(),
    ...overrides,
  };
  return { adapter, storage: createPersistentStorage(adapter) };
}
async function open(
  vault = fixture(),
  options: {
    secrets?: Secrets;
    openEav?: OpenEav;
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
  const factory = vi.fn<OpenEav>(options.openEav ?? (() => vault.storage));
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

test('credential changes persist before use, retain storage, and restore preloaded defaults', async () => {
  const vault = fixture();
  const { session, factory } = await open(vault, {
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
  const vault = fixture();
  const { session, factory } = await open(vault);
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
  const { session } = await open(fixture());
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
  const { session, root } = await open(fixture());
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

test('unmount during secrets JSON parsing never reads remembered credentials', async () => {
  const response = new Response('{}');
  let release!: () => void;
  vi.spyOn(response, 'json').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({});
      }),
  );
  const { root } = await open(fixture(), { response });
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
  const { session, root, factory } = await open(fixture(), {
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

test('unlocked sessions load accepted cache before refreshing and close on unmount', async () => {
  const order: string[] = [];
  const vault = fixture({
    cached: async () => {
      order.push('cached');
      return empty;
    },
    load: async () => {
      order.push('refresh');
      return empty;
    },
    close: () => {
      order.push('close');
    },
  });
  const { session, root } = await open(vault);
  expect(order).toEqual(['cached', 'refresh']);
  expect(session().eav).toBe(vault.storage);
  expect(session().ready).toBe(true);
  expect(session().status.kind).toBe('synced');
  await act(async () => root.unmount());
  roots.splice(roots.indexOf(root), 1);
  expect(order).toEqual(['cached', 'refresh', 'close']);
});

test.each([true, false])(
  'remote failure preserves only accepted cache readiness: %s',
  async (cached) => {
    const { session } = await open(
      fixture({
        cached: async () => (cached ? empty : null),
        load: async () => {
          throw new Error('GitHub unavailable');
        },
      }),
    );
    expect(session().status.kind).toBe('error');
    expect(session().ready).toBe(cached);
  },
);

test('a cold session waits for acceptance before admitting an empty vault', async () => {
  let release!: () => void;
  const vault = fixture({
    cached: async () => null,
    load: () =>
      new Promise((resolve) => {
        release = () => resolve(empty);
      }),
  });
  const { session } = await open(vault);
  expect(session().ready).toBe(false);
  expect(session().status.kind).toBe('syncing');
  await act(async () => {
    release();
    await Promise.resolve();
  });
  expect(session().ready).toBe(true);
  expect(session().status.kind).toBe('synced');
});

test('visible sessions refresh periodically and expose manual refresh', async () => {
  const vault = fixture();
  const timers = vi.spyOn(globalThis, 'setInterval');
  const { session } = await open(vault);
  const callback = timers.mock.calls.find(([, interval]) => interval === 30_000)?.[0];
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  await act(async () => {
    if (typeof callback === 'function') callback();
    await Promise.resolve();
  });
  await act(async () => session().refresh());
  expect(vault.adapter.load).toHaveBeenCalledTimes(3);
});

test('GitHub credentials validate and persist before use while retained EAV handles stay open', async () => {
  const live = fixture();
  const candidate = fixture();
  let credentials!: () => Secrets | null;
  const { session } = await open(live, {
    openEav: (options) => {
      if (options.secrets()?.github === 'replacement') return candidate.storage;
      credentials = options.secrets;
      return live.storage;
    },
  });
  const identity = session().identity;
  vi.mocked(saveSecretOverrides).mockImplementationOnce(async () => {
    expect(credentials()?.github).toBe('fictional-token');
    expect(candidate.adapter.load).toHaveBeenCalledOnce();
  });
  await act(async () => session().updateSecret('github', 'replacement'));
  expect(session().eav).toBe(live.storage);
  expect(session().identity).toBe(identity);
  expect(credentials()?.github).toBe('replacement');
  expect(candidate.adapter.close).toHaveBeenCalledOnce();
  expect(live.adapter.close).not.toHaveBeenCalled();
});

test.each(['validation', 'persistence'])(
  'failed GitHub %s retains credentials and storage',
  async (failure) => {
    const live = fixture();
    const candidate = fixture({
      load: async () => {
        if (failure === 'validation') throw new Error('Rejected');
        return empty;
      },
    });
    const { session } = await open(live, {
      openEav: (options) =>
        options.secrets()?.github === 'replacement' ? candidate.storage : live.storage,
    });
    if (failure === 'persistence')
      vi.mocked(saveSecretOverrides).mockRejectedValueOnce(new Error('Rejected'));
    await act(async () => {
      await expect(session().updateSecret('github', 'replacement')).rejects.toThrow('Rejected');
    });
    expect(session().eav).toBe(live.storage);
    expect(session().secrets?.github).toBe('fictional-token');
    expect(session().secretOverrides).toEqual({});
    expect(candidate.adapter.close).toHaveBeenCalledOnce();
  },
);

test('signout drains an entered EAV publication, rejects new writes and clears before close', async () => {
  const order: string[] = [];
  let release!: () => void;
  let enter!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const vault = fixture({
    append: async () => {
      enter();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push('accepted');
    },
    clear: async () => {
      order.push('clear');
    },
    close: () => {
      order.push('close');
    },
  });
  const { session } = await open(vault);
  await using db = await openDatabase({
    storage: vault.storage,
    schema: e.registry({ records: e.entity('record', { text: e.string() }) }),
  });
  const write = db.transaction((tx) => tx.entities.records.insert({ text: 'Retained' }));
  await entered;
  vi.spyOn(location, 'reload').mockImplementation(() => {
    order.push('reload');
  });
  vi.mocked(forget).mockImplementation(async () => {
    order.push('forget');
  });
  let ending!: Promise<void>;
  await act(async () => {
    ending = session().signOut!();
  });
  expect(order).toEqual([]);
  await expect(db.transaction(async () => undefined)).rejects.toThrow('closed');
  await act(async () => {
    release();
    await write;
    await ending;
  });
  expect(order[0]).toBe('accepted');
  expect(order.slice(1, 3).sort()).toEqual(['clear', 'forget']);
  expect(order.slice(3)).toEqual(['reload', 'close']);
  expect(session().eav).toBeNull();
  expect(session().secrets).toBeNull();
});

test('retained save retries are rejected after signout', async () => {
  const vault = fixture({
    append: async () => {
      throw new Error('Offline');
    },
  });
  const { session } = await open(vault);
  await using db = await openDatabase({
    storage: vault.storage,
    schema: e.registry({ records: e.entity('record', { text: e.string() }) }),
  });
  let failed!: SaveError;
  try {
    await db.transaction((tx) => tx.entities.records.insert({ text: 'Pending' }));
  } catch (error) {
    if (!(error instanceof SaveError)) throw error;
    failed = error;
  }
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  await act(async () => session().signOut!());
  await expect(failed.retry()).rejects.toThrow('closed');
});

test('signout cancels pending candidate validation and queued credential edits', async () => {
  const live = fixture();
  let release!: () => void;
  const candidate = fixture({
    cached: () =>
      new Promise((resolve) => {
        release = () => resolve(empty);
      }),
  });
  const { session } = await open(live, {
    openEav: (options) =>
      options.secrets()?.github === 'replacement' ? candidate.storage : live.storage,
  });
  let updating!: Promise<void>;
  let queued!: Promise<void>;
  await act(async () => {
    updating = session().updateSecret('github', 'replacement');
    queued = session().updateSecret('openai', 'queued');
    await Promise.resolve();
  });
  const rejected = expect(updating).rejects.toThrow('session has closed');
  const queuedRejected = expect(queued).rejects.toThrow('session has closed');
  vi.spyOn(location, 'reload').mockImplementation(() => undefined);
  await act(async () => {
    await session().signOut!();
    await Promise.all([rejected, queuedRejected]);
  });
  release();
  await Promise.resolve();
  expect(candidate.adapter.close).toHaveBeenCalledOnce();
  expect(candidate.adapter.load).not.toHaveBeenCalled();
  expect(saveSecretOverrides).not.toHaveBeenCalled();
});

test('cache clearing failure still forgets credentials and closes storage', async () => {
  const vault = fixture({
    clear: async () => {
      throw new Error('Cache unavailable');
    },
  });
  const { session } = await open(vault);
  await act(async () => {
    await expect(session().signOut!()).rejects.toThrow('Cache unavailable');
  });
  expect(forget).toHaveBeenCalledOnce();
  expect(vault.adapter.close).toHaveBeenCalledOnce();
  expect(session().eav).toBeNull();
  expect(session().status).toEqual({
    kind: 'error',
    message: 'Sign-out could not finish: Error: Cache unavailable',
  });
});

test('old credential refresh failure cannot replace the refreshed status after rotation', async () => {
  const live = fixture();
  const candidate = fixture();
  const { session } = await open(live, {
    openEav: (options) =>
      options.secrets()?.github === 'replacement' ? candidate.storage : live.storage,
  });
  let rejectOld!: (reason: Error) => void;
  vi.mocked(live.adapter.load).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectOld = reject;
      }),
  );
  let refreshing!: Promise<void>;
  await act(async () => {
    refreshing = session().refresh();
    await Promise.resolve();
  });
  await act(async () => session().updateSecret('github', 'replacement'));
  await act(async () => {
    rejectOld(new Error('Retired token'));
    await refreshing;
    await Promise.resolve();
  });
  expect(session().secrets?.github).toBe('replacement');
  expect(session().status.kind).toBe('synced');
  expect(session().eav).toBe(live.storage);
});

test('a pending EAV save retries after token rotation without repeating its calculation', async () => {
  let credentials!: () => Secrets | null;
  const usedTokens: (string | undefined)[] = [];
  const live = fixture({
    append: async () => {
      const token = credentials()?.github;
      usedTokens.push(token);
      if (token === 'fictional-token') throw new Error('Retired token');
    },
  });
  const candidate = fixture();
  const { session } = await open(live, {
    openEav: (options) => {
      if (options.secrets()?.github === 'replacement') return candidate.storage;
      credentials = options.secrets;
      return live.storage;
    },
  });
  const schema = e.registry({ records: e.entity('record', { text: e.string() }) });
  await using db = await openDatabase({ storage: live.storage, schema });
  const calculate = vi.fn(async (tx: Transaction<typeof schema>) =>
    tx.entities.records.insert({ text: 'Once' }),
  );
  let failed!: SaveError;
  try {
    await db.transaction(calculate);
  } catch (error) {
    if (!(error instanceof SaveError)) throw error;
    failed = error;
  }
  await act(async () => session().updateSecret('github', 'replacement'));
  await failed.retry();
  expect(usedTokens).toEqual(['fictional-token', 'replacement']);
  expect(calculate).toHaveBeenCalledOnce();
  expect(await db.entities.records.first({ select: { text: true } })).toMatchObject({
    text: 'Once',
  });
});

import {
  closeStorage,
  clearStorage,
  cachedStorage,
  refreshStorage,
  suspendStorage,
  drainStorage,
  type MemoryStorage,
} from '@/vault/eav/index.ts';
import type { OpenEav } from './adapters.ts';
// Which vault the app is on, and its state: GitHub through the device cache, in every browser. Built, the
// secrets are unlocked with the password (unlock.ts); in dev they come from the environment (vite.config.ts)
// and it loads right in. Opens from what the device kept, then refreshes: at once, when the tab comes back (at most every
// 30 s), and when the backend says something changed.
import { useEffect, useRef, useState } from 'react';
import type { Sealed, Secrets } from './sealed.ts';
import {
  applySecretOverrides,
  forget,
  rememberedCredentials,
  saveSecretOverrides,
  unlockCredentials,
  type Credentials,
  type SecretOverrides,
} from './unlock.ts';
import { serial } from '@/runtime/async.ts';
import { createSessionCredentials, type SessionCredentials } from './credentials.ts';

export type Status =
  | { kind: 'loading' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export interface Session {
  /** Stable through credential-driven adapter replacement within this unlocked session. */
  identity: object;
  credentialPending: boolean;
  credentials: SessionCredentials;
  /** An accepted snapshot is available locally, including an empty vault. */
  ready: boolean;
  secrets: Secrets | null;
  preloadedSecrets: Secrets | null;
  secretOverrides: SecretOverrides;
  /** Undefined restores login defaults; null disables an optional credential. */
  updateSecret: (key: keyof Secrets, value: string | null | undefined) => Promise<void>;
  /** Set while the secrets wait for the password. */
  locked: { unlock: (password: string) => Promise<void> } | null;
  signOut: (() => Promise<void>) | null;
  eav: MemoryStorage | null;
  status: Status;
  refresh: () => Promise<void>;
}

const EVERY = 30_000;
declare const __DEV_SECRETS__: Secrets | null;
const DEV_SECRETS = typeof __DEV_SECRETS__ === 'undefined' ? null : __DEV_SECRETS__;

/** Own unlocked EAV storage, credentials and write lifetimes. */
export function useSession(openEav: OpenEav): Session {
  const identity = useRef({}).current;
  const [credentialPending, setCredentialPending] = useState(false);
  const credentialUpdates = useRef(0);
  const [ready, setReady] = useState(false);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [preloadedSecrets, setPreloadedSecrets] = useState<Secrets | null>(null);
  const [secretOverrides, setSecretOverrides] = useState<SecretOverrides>({});
  const [eav, setEav] = useState<MemoryStorage | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const activeStorage = useRef<MemoryStorage | null>(null);
  const currentCredentials = useRef<Credentials | null>(null);
  const deployment = useRef<Sealed | null>(null);
  const updates = useRef(serial());
  const candidates = useRef(new Set<MemoryStorage>());
  const busy = useRef(new Set<MemoryStorage>());
  const mounted = useRef<boolean>(true);
  const signingOut = useRef<Promise<void> | null>(null);
  const lifetime = useRef(new AbortController());
  const generation = useRef(0);

  const activeStore = (candidate: MemoryStorage) =>
    mounted.current && signingOut.current === null && activeStorage.current === candidate;
  const checkSession = (runGeneration: number) => {
    if (!mounted.current || signingOut.current !== null || generation.current !== runGeneration)
      throw new Error('The vault session has closed.');
  };
  const closeReplacements = () => {
    for (const candidate of candidates.current) closeStorage(candidate);
    candidates.current.clear();
  };
  const publishCredentials = (credentials: Credentials) => {
    currentCredentials.current = credentials;
    setSecrets(credentials.secrets);
    setPreloadedSecrets(credentials.preloadedSecrets);
    setSecretOverrides(credentials.secretOverrides);
  };

  const refresh = async (store: MemoryStorage) => {
    if (!activeStore(store) || busy.current.has(store)) return;
    busy.current.add(store);
    const token = currentCredentials.current?.secrets.github;
    const currentRefresh = () =>
      activeStore(store) && token === currentCredentials.current?.secrets.github;
    setStatus({ kind: 'syncing' });
    try {
      await refreshStorage(store, { remote: true });
      if (currentRefresh()) {
        setReady(true);
        setStatus({ kind: 'synced', at: Date.now() });
      }
    } catch (error) {
      if (currentRefresh())
        setStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? { kind: 'offline' }
            : { kind: 'error', message: String(error) },
        );
    } finally {
      busy.current.delete(store);
      if (activeStore(store) && token !== currentCredentials.current?.secrets.github)
        refresh(store).catch(() => undefined);
    }
  };
  const begin = (credentials: Credentials, runGeneration: number) => {
    checkSession(runGeneration);
    publishCredentials(credentials);
    const store = openEav({ secrets: () => currentCredentials.current?.secrets ?? null });
    activeStorage.current = store;
    setEav(store);
    setReady(false);
    setStatus({ kind: 'loading' });
    return (async () => {
      try {
        const cached = await cachedStorage(store);
        if (activeStore(store) && cached) setReady(true);
      } catch (error) {
        if (activeStore(store)) setStatus({ kind: 'error', message: String(error) });
      }
      await refresh(store);
    })();
  };

  const updateSecret = (key: keyof Secrets, value: string | null | undefined) => {
    const runGeneration = generation.current;
    try {
      checkSession(runGeneration);
    } catch (error) {
      return Promise.reject(error);
    }
    credentialUpdates.current++;
    setCredentialPending(true);
    const update = updates.current(async () => {
      checkSession(runGeneration);
      const previous = currentCredentials.current;
      if (!previous) throw new Error('Unlock the vault to change credentials.');
      if (key === 'github' && (value === null || value?.trim() === ''))
        throw new Error('A GitHub token is required.');
      const overrides = { ...previous.secretOverrides };
      if (value === undefined) delete overrides[key];
      else overrides[key] = typeof value === 'string' ? value.trim() || null : value;
      const next: Credentials = {
        preloadedSecrets: previous.preloadedSecrets,
        secretOverrides: overrides,
        secrets: applySecretOverrides(previous.preloadedSecrets, overrides),
      };
      const reconnect = previous.secrets.github !== next.secrets.github;
      let candidate: MemoryStorage | undefined;
      try {
        if (reconnect) {
          candidate = openEav({ secrets: () => next.secrets });
          candidates.current.add(candidate);
          await cachedStorage(candidate);
          checkSession(runGeneration);
          await refreshStorage(candidate, { remote: true });
          checkSession(runGeneration);
        }
        if (deployment.current)
          await saveSecretOverrides(
            deployment.current,
            overrides,
            Date.now(),
            previous.secretOverrides,
          );
        checkSession(runGeneration);
        // The live adapter reads credentials at request time; retained saves keep their identity.
        publishCredentials(next);
        if (reconnect && activeStorage.current)
          refresh(activeStorage.current).catch(() => undefined);
      } finally {
        if (candidate && candidates.current.delete(candidate)) closeStorage(candidate);
      }
    }, lifetime.current.signal);
    return update.finally(() => {
      credentialUpdates.current--;
      if (mounted.current && !signingOut.current)
        setCredentialPending(credentialUpdates.current > 0);
    });
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount; what it calls reads only refs and state setters
  useEffect(() => {
    const runGeneration = ++generation.current;
    const start = async () => {
      if (DEV_SECRETS)
        return begin(
          { preloadedSecrets: DEV_SECRETS, secretOverrides: {}, secrets: DEV_SECRETS },
          runGeneration,
        );
      const res = await fetch('./secrets.json').catch(() => null);
      if (!mounted.current || generation.current !== runGeneration) return;
      if (!res?.ok)
        return setStatus({
          kind: 'error',
          message: import.meta.env.DEV
            ? 'No secrets in dev: set VAULT_GITHUB_TOKEN in .env.local (README, Commands).'
            : 'No secrets.json: the publish workflow seals it from the repo secrets.',
        });
      const s: Sealed = await res.json();
      if (!mounted.current || generation.current !== runGeneration) return;
      deployment.current = s;
      const u = await rememberedCredentials(s);
      if (!mounted.current || generation.current !== runGeneration) return;
      if (u) await begin(u, runGeneration);
      else setSealed(s);
    };
    mounted.current = true;
    lifetime.current = new AbortController();
    start().catch((e) => {
      if (mounted.current && generation.current === runGeneration)
        setStatus({ kind: 'error', message: String(e) });
    });
    return () => {
      mounted.current = false;
      generation.current++;
      lifetime.current.abort(new Error('The vault session has closed.'));
      deployment.current = null;
      closeReplacements();
      const store = activeStorage.current;
      activeStorage.current = null;
      if (store) {
        suspendStorage(store);
        void drainStorage(store).then(() => {
          if (!mounted.current) currentCredentials.current = null;
          closeStorage(store);
        });
      }
    };
  }, []);

  // EAV cache lifetime follows the unlocked session, with credentials kept out of workflows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh only uses refs and setters.
  useEffect(() => {
    if (!eav) return;
    const back = () => {
      if (document.visibilityState === 'visible') refresh(eav).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', back);
    addEventListener('online', back);
    const timer = setInterval(back, EVERY);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
      removeEventListener('online', back);
    };
  }, [eav]);

  const credentialGeneration = generation.current;
  return {
    identity,
    credentialPending,
    credentials: createSessionCredentials(
      { secrets, secretOverrides, credentialPending, updateSecret },
      {
        persistent: deployment.current !== null,
        read: () => {
          checkSession(credentialGeneration);
          return {
            secrets: currentCredentials.current?.secrets ?? null,
            secretOverrides: currentCredentials.current?.secretOverrides ?? {},
            credentialPending: credentialUpdates.current > 0,
            updateSecret,
          };
        },
      },
    ),
    ready,
    secrets,
    preloadedSecrets,
    secretOverrides,
    updateSecret,
    eav,
    status,
    refresh: () => (eav ? refresh(eav) : Promise.resolve()),
    locked:
      sealed && !eav
        ? {
            async unlock(password) {
              const runGeneration = generation.current;
              checkSession(runGeneration);
              const u = await unlockCredentials(sealed, password);
              checkSession(runGeneration);
              setSealed(null);
              await begin(u, runGeneration);
            },
          }
        : null,
    signOut: secrets
      ? () => {
          if (signingOut.current !== null) return signingOut.current;
          generation.current++;
          lifetime.current.abort(new Error('The vault session has closed.'));
          const store = activeStorage.current;
          if (store) suspendStorage(store);
          activeStorage.current = null;
          deployment.current = null;
          closeReplacements();
          setEav(null);
          setReady(false);
          setSecrets(null);
          setPreloadedSecrets(null);
          setSecretOverrides({});
          setCredentialPending(false);
          setSealed(null);
          signingOut.current = (async () => {
            try {
              if (store) await drainStorage(store);
              currentCredentials.current = null;
              const cleared = await Promise.allSettled([
                Promise.resolve().then(() => store && clearStorage(store)),
                Promise.resolve().then(() => forget()),
              ]);
              const failed = cleared.find((result) => result.status === 'rejected');
              if (failed?.status === 'rejected') throw failed.reason;
              location.reload();
            } catch (error) {
              if (mounted.current)
                setStatus({
                  kind: 'error',
                  message: `Sign-out could not finish: ${String(error)}`,
                });
              throw error;
            } finally {
              currentCredentials.current = null;
              if (store) closeStorage(store);
            }
          })();
          return signingOut.current;
        }
      : null,
  };
}

// Which vault the app is on, and its state: GitHub through the encrypted cache, in every browser. Built, the
// secrets are unlocked with the password (unlock.ts); in dev they come from the environment (vite.config.ts)
// and it loads right in. Opens from what the device kept, then refreshes: at once, when the tab comes back (at most every
// 30 s), and when the backend says something changed.
import { useEffect, useRef, useState } from 'react';
import type { Sealed, Secrets } from './sealed.ts';
import { Offline, type Head, type OpenBackend, type VaultBackend } from '../storage/backend.ts';
import { devUnlocked, forget, remembered, unlock, type Unlocked } from './unlock.ts';

export type Status =
  | { kind: 'loading' }
  | { kind: 'syncing' }
  | { kind: 'synced'; at: number }
  | { kind: 'offline' }
  | { kind: 'error'; message: string };

export interface Session {
  backend: VaultBackend | null;
  head: Head | null;
  setHead: (h: Head) => void;
  status: Status;
  secrets: Secrets | null;
  /** Set while the secrets wait for the password. */
  locked: { unlock: (password: string) => Promise<void> } | null;
  signOut: (() => Promise<void>) | null;
}

const EVERY = 30_000;
declare const __DEV_SECRETS__: Secrets | null;
const DEV_SECRETS = typeof __DEV_SECRETS__ === 'undefined' ? null : __DEV_SECRETS__;

/** `openBackend`: the app's backend (main.tsx); `keeps`: the permanent file selection rules. */
export function useSession(openBackend: OpenBackend, keeps: (path: string) => boolean): Session {
  const [backend, setBackend] = useState<VaultBackend | null>(null);
  const [head, setHead] = useState<Head | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const last = useRef(0);
  const busy = useRef<boolean>(false);

  const refresh = async (b: VaultBackend, force = false) => {
    if (busy.current || (!force && Date.now() - last.current < EVERY)) return;
    busy.current = true;
    last.current = Date.now();
    setStatus({ kind: 'syncing' });
    try {
      const h = await b.refresh();
      if (h) setHead(h);
      setStatus({ kind: 'synced', at: Date.now() });
    } catch (e) {
      setStatus(
        e instanceof Offline
          ? { kind: 'offline' }
          : { kind: 'error', message: (e as Error).message },
      );
    } finally {
      busy.current = false;
    }
  };

  const open = async (b: VaultBackend) => {
    setBackend(b);
    const h = await b.cached();
    if (h) setHead(h);
    await refresh(b, true);
  };
  const begin = (u: Unlocked) => {
    setSecrets(u.secrets);
    return open(openBackend({ secrets: u.secrets, key: u.cacheKey, keeps }));
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount; what it calls reads only refs and state setters
  useEffect(() => {
    const start = async () => {
      if (DEV_SECRETS) return begin(await devUnlocked(DEV_SECRETS));
      const res = await fetch('./secrets.json').catch(() => null);
      if (!res?.ok)
        return setStatus({
          kind: 'error',
          message: import.meta.env.DEV
            ? 'No secrets in dev: set VAULT_GITHUB_TOKEN in .env.local (README, Commands).'
            : 'No secrets.json: the publish workflow seals it from the repo secrets.',
        });
      const s: Sealed = await res.json();
      const u = await remembered(s);
      if (u) await begin(u);
      else setSealed(s);
    };
    start().catch((e) => setStatus({ kind: 'error', message: String(e) }));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh reads only refs and state setters, so any render's will do
  useEffect(() => {
    if (!backend) return;
    // Changed elsewhere: another tab wrote the cache (read it), or the files changed on disk (refetch).
    const off = backend.watch((h) => (h ? setHead(h) : void refresh(backend, true)));
    const back = () => {
      if (document.visibilityState === 'visible') void refresh(backend);
    };
    document.addEventListener('visibilitychange', back);
    addEventListener('online', back);
    return () => {
      off();
      document.removeEventListener('visibilitychange', back);
      removeEventListener('online', back);
    };
  }, [backend]);

  return {
    backend,
    head,
    setHead,
    status,
    secrets,
    locked:
      sealed && !backend
        ? {
            async unlock(password) {
              const u = await unlock(sealed, password);
              setSealed(null);
              await begin(u);
            },
          }
        : null,
    signOut: secrets
      ? async () => {
          await backend?.clear?.();
          await forget();
          location.reload();
        }
      : null,
  };
}

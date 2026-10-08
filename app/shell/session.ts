// Which vault the app is on, and its state. Dev, or built without secrets.json: a folder on this device
// (backends/folder.ts). Built: the secrets are unlocked (unlock.ts), then GitHub through the encrypted
// cache. Opens from what the device kept, then refreshes: at once, when the tab comes back (at most every
// 30 s), and when the backend says something changed.
import { useEffect, useRef, useState } from 'react';
import type { Sealed, Secrets } from '../../core/sealed.ts';
import { Offline, type Head, type VaultBackend } from './backend.ts';
import { forget, remembered, unlock, type Unlocked } from './unlock.ts';
import { githubBackend } from '../backends/github/index.ts';
import {
  canPickFolder,
  folderBackend,
  permitted,
  pickFolder,
  savedFolder,
  type Folder,
} from '../backends/folder.ts';
import { later } from './later.ts';

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
  /** Set while the app waits for the vault folder: the one kept from last time (asked again), or a new pick. */
  folder: { saved: string | null; open: (pick: boolean) => Promise<void> } | null;
}

const EVERY = 30_000;
const DEV = import.meta.env.DEV && !import.meta.env.VITE_GITHUB_API;

export function useSession(): Session {
  const [backend, setBackend] = useState<VaultBackend | null>(null);
  const [head, setHead] = useState<Head | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [folder, setFolder] = useState<{ saved: Folder | null } | null>(null);
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
  const openFolder = (root: Folder) => {
    setFolder(null);
    return open(folderBackend(root));
  };
  const askFolder = async () => {
    if (!canPickFolder())
      return setStatus({
        kind: 'error',
        message: 'Opening a vault folder needs a Chromium browser (File System Access).',
      });
    const saved = await savedFolder();
    if (saved && (await permitted(saved))) return openFolder(saved);
    setFolder({ saved });
  };
  const begin = (u: Unlocked) => {
    setSecrets(u.secrets);
    return open(
      githubBackend({
        token: u.secrets.github,
        key: u.cacheKey,
        api: import.meta.env.VITE_GITHUB_API || undefined,
      }),
    );
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount; what it calls reads only refs and state setters
  useEffect(() => {
    if (DEV) {
      later(askFolder());
      return;
    }
    const start = async () => {
      const res = await fetch('./secrets.json').catch(() => null);
      if (!res?.ok)
        return canPickFolder()
          ? askFolder()
          : setStatus({
              kind: 'error',
              message: 'No secrets.json: the publish workflow seals it from the repo secrets.',
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
    const off = backend.watch((h) => (h ? setHead(h) : later(refresh(backend, true))));
    const back = () => {
      if (document.visibilityState === 'visible') later(refresh(backend));
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
          await forget();
          location.reload();
        }
      : null,
    folder: folder && {
      saved: folder.saved?.name ?? null,
      async open(pick) {
        const root = pick || !folder.saved ? await pickFolder() : folder.saved;
        if (!(await permitted(root, true)))
          throw new Error('The browser was not allowed to read and write the folder.');
        await openFolder(root);
      },
    },
  };
}

import { closeStorage, clearStorage, type MemoryStorage } from '@/vault/eav/index.ts';
import type { OpenNodes, OpenEav } from './adapters.ts';
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
import type { NodeBackend } from '@/vault/nodes/store.ts';
import type { TransactionStore } from '@/vault/transactions/store.ts';
import { createTransactionSession } from '@/vault/transactions/lifetime.ts';
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
  eav?: MemoryStorage | null;
  nodes: TransactionStore | null;
  nodeStatus: Status;
  refreshNodes: () => Promise<void>;
}

const EVERY = 30_000;
declare const __DEV_SECRETS__: Secrets | null;
const DEV_SECRETS = typeof __DEV_SECRETS__ === 'undefined' ? null : __DEV_SECRETS__;

/** Own unlocked node storage, credentials and write lifetimes. */
export function useSession(openNodes: OpenNodes, openEav?: OpenEav): Session {
  const identity = useRef({}).current;
  const [credentialPending, setCredentialPending] = useState(false);
  const credentialUpdates = useRef(0);
  const [ready, setReady] = useState(false);
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [secrets, setSecrets] = useState<Secrets | null>(null);
  const [preloadedSecrets, setPreloadedSecrets] = useState<Secrets | null>(null);
  const [secretOverrides, setSecretOverrides] = useState<SecretOverrides>({});
  const [nodes, setNodes] = useState<NodeBackend | null>(null);
  const [nodeStatus, setNodeStatus] = useState<Status>({ kind: 'loading' });
  const activeNodes = useRef<NodeBackend | null>(null);
  const eav = useRef<MemoryStorage | null>(null);
  const transactions = useRef(createTransactionSession());
  const currentCredentials = useRef<Credentials | null>(null);
  const deployment = useRef<Sealed | null>(null);
  const updates = useRef(serial());
  const replacementNodes = useRef(new Set<NodeBackend>());
  const nodeBusy = useRef(new Set<NodeBackend>());
  const mounted = useRef<boolean>(true);
  const signingOut = useRef<Promise<void> | null>(null);
  const lifetime = useRef(new AbortController());
  const generation = useRef(0);

  const activeNode = (candidate: NodeBackend) =>
    mounted.current && signingOut.current === null && activeNodes.current === candidate;
  const checkSession = (runGeneration: number) => {
    if (!mounted.current || signingOut.current !== null || generation.current !== runGeneration)
      throw new Error('The vault session has closed.');
  };
  const closeReplacements = () => {
    for (const candidate of replacementNodes.current) candidate.close();
    replacementNodes.current.clear();
  };
  const publishCredentials = (credentials: Credentials) => {
    currentCredentials.current = credentials;
    setSecrets(credentials.secrets);
    setPreloadedSecrets(credentials.preloadedSecrets);
    setSecretOverrides(credentials.secretOverrides);
  };

  const refreshNodes = async (store: NodeBackend) => {
    if (!activeNode(store) || nodeBusy.current.has(store)) return;
    nodeBusy.current.add(store);
    setNodeStatus({ kind: 'syncing' });
    try {
      await store.refresh();
      if (activeNode(store)) {
        setReady(true);
        setNodeStatus({ kind: 'synced', at: Date.now() });
      }
    } catch (error) {
      if (activeNode(store))
        setNodeStatus(
          typeof navigator !== 'undefined' && !navigator.onLine
            ? { kind: 'offline' }
            : { kind: 'error', message: String(error) },
        );
    } finally {
      nodeBusy.current.delete(store);
    }
  };
  const begin = (credentials: Credentials, runGeneration: number) => {
    checkSession(runGeneration);
    const store = openNodes({ secrets: credentials.secrets });
    eav.current = openEav?.({ secrets: () => currentCredentials.current?.secrets ?? null }) ?? null;
    void transactions.current.replace(store, (previous) => (previous as NodeBackend).close());
    activeNodes.current = store;
    setNodes(store);
    setReady(false);
    setNodeStatus({ kind: 'loading' });
    publishCredentials(credentials);
    return (async () => {
      try {
        const cached = await store.cached();
        if (activeNode(store) && cached) setReady(true);
      } catch (error) {
        if (activeNode(store)) setNodeStatus({ kind: 'error', message: String(error) });
      }
      await refreshNodes(store);
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
      let nodeReplacement: NodeBackend | undefined;
      try {
        if (reconnect) {
          nodeReplacement = openNodes({ secrets: next.secrets });
          replacementNodes.current.add(nodeReplacement);
          await nodeReplacement.cached();
          checkSession(runGeneration);
          await nodeReplacement.refresh();
          checkSession(runGeneration);
        }
        checkSession(runGeneration);
        if (deployment.current)
          await saveSecretOverrides(
            deployment.current,
            overrides,
            Date.now(),
            previous.secretOverrides,
          );
        checkSession(runGeneration);
        if (nodeReplacement) {
          activeNodes.current = nodeReplacement;
          // Invalidate preparation before React schedules another application calculation.
          void transactions.current.replace(nodeReplacement, (previous) =>
            (previous as NodeBackend).close(),
          );
          setNodes(nodeReplacement);
          setReady(true);
          setNodeStatus({ kind: 'synced', at: Date.now() });
        }
        publishCredentials(next);
      } catch (error) {
        if (nodeReplacement && replacementNodes.current.has(nodeReplacement))
          nodeReplacement.close();
        throw error;
      } finally {
        if (nodeReplacement) replacementNodes.current.delete(nodeReplacement);
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
        return setNodeStatus({
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
    transactions.current = createTransactionSession();
    start().catch((e) => {
      if (mounted.current && generation.current === runGeneration)
        setNodeStatus({ kind: 'error', message: String(e) });
    });
    return () => {
      mounted.current = false;
      generation.current++;
      lifetime.current.abort(new Error('The vault session has closed.'));
      currentCredentials.current = null;
      deployment.current = null;
      closeReplacements();
      const writes = transactions.current;
      const store = activeNodes.current;
      writes.close();
      void writes.drain().then(() => store?.close());
      activeNodes.current = null;
      if (eav.current) closeStorage(eav.current);
      eav.current = null;
    };
  }, []);

  // Node cache lifetime follows the unlocked session, with credentials kept out of workflows.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshNodes only uses refs and setters.
  useEffect(() => {
    if (!nodes) return;
    const back = () => {
      if (document.visibilityState === 'visible') refreshNodes(nodes).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', back);
    addEventListener('online', back);
    const timer = setInterval(back, EVERY);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', back);
      removeEventListener('online', back);
    };
  }, [nodes]);

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
    eav: eav.current,
    nodes: nodes ? transactions.current.nodes : null,
    nodeStatus,
    refreshNodes: () => (nodes ? refreshNodes(nodes) : Promise.resolve()),
    locked:
      sealed && !nodes
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
          const writes = transactions.current;
          writes.close();
          currentCredentials.current = null;
          deployment.current = null;
          const store = activeNodes.current;
          const eavStore = eav.current;
          eav.current = null;
          activeNodes.current = null;
          closeReplacements();
          setNodes(null);
          setReady(false);
          setSecrets(null);
          setPreloadedSecrets(null);
          setSecretOverrides({});
          setCredentialPending(false);
          setSealed(null);
          signingOut.current = (async () => {
            try {
              await writes.drain();
              const cleared = await Promise.allSettled([
                Promise.resolve().then(() => store?.clear()),
                Promise.resolve().then(() => eavStore && clearStorage(eavStore)),
                Promise.resolve().then(() => forget()),
              ]);
              const failed = cleared.find((result) => result.status === 'rejected');
              if (failed?.status === 'rejected') throw failed.reason;
              location.reload();
            } catch (error) {
              if (mounted.current)
                setNodeStatus({
                  kind: 'error',
                  message: `Sign-out could not finish: ${String(error)}`,
                });
              throw error;
            } finally {
              store?.close();
              if (eavStore) closeStorage(eavStore);
            }
          })();
          return signingOut.current;
        }
      : null,
  };
}

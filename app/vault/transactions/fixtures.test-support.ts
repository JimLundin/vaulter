import { onTestFinished } from 'vitest';
import type { NodeStore } from '@/vault/nodes/store.ts';
import type { TransactionStore, WriterContext } from './store.ts';
import { createTransactionSession } from './lifetime.ts';

// Transport overrides in a test share its memory adapter's subscription identity. Replacing the
// override exercises real core generation changes and preserves already finalized requests.
const sessions = new WeakMap<
  object,
  { source: NodeStore; session: ReturnType<typeof createTransactionSession> }
>();
export function transactionFixture(
  source: NodeStore | TransactionStore,
  identity: object = source.subscribe,
): TransactionStore {
  if ('writer' in source) return source;
  let current = sessions.get(identity);
  if (!current) {
    current = { source, session: createTransactionSession(source) };
    sessions.set(identity, current);
    const session = current.session;
    onTestFinished(async () => {
      session.close();
      await session.drain();
    });
  } else if (current.source !== source) {
    void current.session.replace(source);
    current.source = source;
  }
  return current.session.nodes;
}

/** This test action lasts until test cleanup, so a preparation helper may return its handle. */
export function writeLifetimeFixture(nodes: NodeStore | TransactionStore, context: WriterContext) {
  const managed = currentTransactionsFixture(nodes);
  const lifetime = managed.writer(context).lifetime();
  onTestFinished(() => lifetime[Symbol.asyncDispose]());
  return lifetime;
}

export const currentTransactionsFixture = (nodes: NodeStore | TransactionStore) =>
  'writer' in nodes
    ? nodes
    : (sessions.get(nodes.subscribe)?.session.nodes ?? transactionFixture(nodes));

export const transactionOptionsFixture = <
  T extends { readonly nodes: NodeStore | TransactionStore },
>(
  options: T,
): Omit<T, 'nodes'> & { nodes: TransactionStore } => ({
  ...options,
  nodes: transactionFixture(options.nodes),
});

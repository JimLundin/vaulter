import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type {
  TransactionRequest,
  TransactionStore,
  WriteLifetime,
} from '@/vault/transactions/store.ts';
import { composeChanges } from '@/vault/transactions/composition.ts';
import type { AgentToolContext, ContentWritePolicy } from './tools.ts';
import { frozen } from '@/vault/nodes/json.ts';

const ownedKinds = new Set(['agentRun', 'contextInput', 'toolExecution']);
/** Agent-owned audit protection is independent of a caller's additional producer policy. */
export function agentContentContext(options: {
  readonly nodes: TransactionStore;
  readonly agent: string;
  readonly run: string;
  readonly signal: AbortSignal;
  readonly live: () => boolean;
  readonly executing: () => boolean;
  readonly writableKinds: readonly string[];
  readonly contentPolicy?: ContentWritePolicy;
  readonly snapshot: NodeSnapshot;
  readonly publicationFailed: (request: TransactionRequest<void>, error: unknown) => void;
  readonly refreshFailed: (error: unknown) => void;
}) {
  let { snapshot } = options;
  let refreshError: unknown;
  const reads = new Map<string, string | null>();
  let tail: Promise<unknown> = Promise.resolve();
  const scopes = new Set<WriteLifetime>();
  const check = () => {
    if (!options.live() || options.signal.aborted)
      throw new DOMException('Agent run stopped', 'AbortError');
  };
  const owns = (node: string, dependencies: Map<string, string | null>) => {
    let version = snapshot.get(node);
    if (!dependencies.has(node)) dependencies.set(node, version?.key.transaction ?? null);
    const seen = new Set<string>();
    while (version) {
      if (ownedKinds.has(String(version.data?.kind))) return true;
      if (!version.placement || seen.has(version.key.node)) return false;
      seen.add(version.key.node);
      const { parent } = version.placement;
      version = snapshot.get(parent);
      if (!dependencies.has(parent)) dependencies.set(parent, version?.key.transaction ?? null);
    }
    return false;
  };
  const context: AgentToolContext = {
    signal: options.signal,
    author: frozen({ recordedBy: options.agent, origin: options.run }),
    snapshot: () => {
      check();
      if (refreshError !== undefined) throw refreshError;
      const captured = snapshot;
      const track = (node: string) => reads.set(node, captured.get(node)?.key.transaction ?? null);
      return {
        sequence: captured.sequence,
        get: (node) => {
          check();
          track(node);
          return captured.get(node);
        },
        resolve: (address) => {
          check();
          if (!address.transaction) track(address.node);
          return captured.resolve(address);
        },
        children: (parent) => {
          check();
          if (typeof parent === 'string') track(parent);
          else if (!parent.transaction) track(parent.node);
          const children = captured.children(parent);
          for (const child of children) track(child.key.node);
          return children;
        },
        roots: () => {
          check();
          const roots = captured.roots();
          for (const root of roots) track(root.key.node);
          return roots;
        },
      };
    },
    write: (calculate) => {
      try {
        check();
        if (!options.executing())
          throw new Error('Tools cannot publish outside an accepted invocation');
      } catch (error) {
        return Promise.reject(error);
      }
      const writing = tail.then(async () => {
        check();
        if (!options.executing())
          throw new Error('Tools cannot publish outside an accepted invocation');
        // This invocation admitted the calculation. Its detached publication may finish after
        // the tool returns; Stop and session closure still prevent entering persistence.
        using writes = options.nodes
          .writer({ recordedBy: options.agent, origin: options.run, admission: check })
          .lifetime({ signal: options.signal });
        scopes.add(writes);
        let changed: readonly string[] = [];
        const publication = writes.write(async ({ id }) => {
          const input = await calculate(id);
          const request = {
            ...input,
            ...composeChanges(input, { changes: [], expectedReads: Object.fromEntries(reads) }),
          };
          const expectedReads = new Map(Object.entries(request.expectedReads ?? {}));
          for (const change of request.changes) {
            const before = snapshot.get(change.node);
            if (owns(change.node, expectedReads) || ownedKinds.has(String(change.data?.kind)))
              throw new Error('Tools cannot modify Agent execution records');
            for (const data of [before?.data, change.data])
              if (
                data &&
                (typeof data.kind !== 'string' || !options.writableKinds.includes(data.kind))
              )
                throw new Error('Tool write is outside its supplied content kinds');
            if (change.placement && owns(change.placement.parent, expectedReads))
              throw new Error('Tools cannot place content inside Agent execution records');
            if (
              change.placement &&
              !request.changes.some((other) => other.node === change.placement?.parent)
            ) {
              const parent = snapshot.get(change.placement.parent);
              if (!expectedReads.has(change.placement.parent))
                expectedReads.set(change.placement.parent, parent?.key.transaction ?? null);
            }
            if (
              options.contentPolicy &&
              !options.contentPolicy({
                node: change.node,
                before: before ?? null,
                after: {
                  key: { node: change.node, transaction: id },
                  data: change.data,
                  placement: change.placement,
                  connection: change.connection,
                },
              })
            )
              throw new Error('Tool write violates its supplied producer policy');
          }
          changed = request.changes.map((change) => change.node);
          return {
            value: undefined,
            transaction: {
              ...request,
              expectedReads: Object.fromEntries(expectedReads),
              undoOf: null,
            },
          };
        });
        let accepted: Awaited<typeof publication.result>;
        try {
          accepted = await publication.result;
        } catch (error) {
          if (publication.snapshot().finalized && publication.snapshot().phase !== 'rejected')
            options.publicationFailed(publication, error);
          throw error;
        } finally {
          scopes.delete(writes);
        }
        // Acceptance is authoritative. A read refresh cannot convert the receipt into failure.
        try {
          snapshot = await options.nodes.snapshot();
        } catch (error) {
          refreshError = error;
          options.refreshFailed(error);
        }
        for (const node of changed) if (reads.has(node)) reads.set(node, accepted.transaction.id);
        return accepted.transaction.id;
      });
      tail = writing.catch(() => undefined);
      return writing;
    },
  };
  return {
    context,
    check,
    settle: async () => {
      const pending = [...scopes];
      for (const scope of pending) scope.close();
      await Promise.all(pending.map((scope) => scope[Symbol.asyncDispose]()));
    },
    refresh: async () => {
      const latest = await options.nodes.snapshot();
      // Refresh never revives an expired context or rebases previously declared read dependencies.
      if (options.live() && !options.signal.aborted) {
        snapshot = latest;
        refreshError = undefined;
      }
    },
  };
}

import type { NodeSnapshot, NodeStore, NodeCommit } from '../vault/nodes/store.ts';
import type { AgentToolContext, ContentWritePolicy } from './tools.ts';
import { frozen } from '../vault/nodes/json.ts';

const ownedKinds = new Set(['agentRun', 'contextInput', 'toolExecution']);
/** Agent-owned audit protection is independent of a caller's additional producer policy. */
export function agentContentContext(options: {
  readonly nodes: NodeStore;
  readonly agent: string;
  readonly run: string;
  readonly signal: AbortSignal;
  readonly live: () => boolean;
  readonly executing: () => boolean;
  readonly writableKinds: readonly string[];
  readonly contentPolicy?: ContentWritePolicy;
  readonly snapshot: NodeSnapshot;
  readonly publicationFailed: (request: NodeCommit, error: unknown) => void;
  readonly refreshFailed: (error: unknown) => void;
}) {
  let { snapshot } = options;
  let refreshError: unknown;
  const reads = new Map<string, string | null>();
  let tail: Promise<unknown> = Promise.resolve();
  const writes = new Set<Promise<string>>();
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
      };
    },
    commit: (input) => {
      try {
        check();
        if (!options.executing())
          throw new Error('Tools cannot publish outside an accepted invocation');
      } catch (error) {
        return Promise.reject(error);
      }
      const request = frozen(structuredClone(input));
      const writing = tail.then(async () => {
        check();
        if (!options.executing())
          throw new Error('Tools cannot publish outside an accepted invocation');
        const expectedReads = new Map([...Object.entries(request.expectedReads ?? {}), ...reads]);
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
                key: { node: change.node, transaction: request.id },
                data: change.data,
                placement: change.placement,
                connection: change.connection,
              },
            })
          )
            throw new Error('Tool write violates its supplied producer policy');
        }
        const publication = frozen({
          ...request,
          expectedReads: Object.fromEntries(expectedReads),
          recordedBy: options.agent,
          origin: options.run,
          undoOf: null,
        });
        let accepted: Awaited<ReturnType<NodeStore['commit']>>;
        try {
          accepted = await options.nodes.commit(publication);
        } catch (error) {
          options.publicationFailed(publication, error);
          throw error;
        }
        // Acceptance is authoritative. A read refresh cannot convert the receipt into failure.
        try {
          snapshot = await options.nodes.snapshot();
        } catch (error) {
          refreshError = error;
          options.refreshFailed(error);
        }
        for (const change of request.changes)
          if (reads.has(change.node)) reads.set(change.node, accepted.id);
        return accepted.id;
      });
      tail = writing.catch(() => undefined);
      writes.add(writing);
      writing.then(
        () => writes.delete(writing),
        () => writes.delete(writing),
      );
      return writing;
    },
  };
  return { context, check, settle: () => Promise.allSettled([...writes]) };
}

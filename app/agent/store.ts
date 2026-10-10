import type { JsonObject, NodeAddress, NodeVersion } from '../vault/nodes/model.ts';
import type { NodeCommit, NodeChange, NodeStore } from '../vault/nodes/store.ts';
import { canonical, frozen } from '../vault/nodes/json.ts';
import type { TransactionKind } from '../vault/nodes/operations.ts';
import type { AgentRunData, ContextInputData, ToolExecutionData } from './records.ts';
import { hasLiveAgentOwner } from './ownership.ts';
import {
  parseAgentRun,
  parseContextInput,
  parseAgentSettings,
  parseToolExecution,
} from './schema.ts';

declare module '../vault/nodes/operations.ts' {
  interface TransactionActions {
    readonly agent: 'startRun' | 'completeRun' | 'stopRun' | 'recordTool' | 'completeTool';
  }
}
export const agentOperations = {
  startRun: { scope: 'agent', action: 'startRun' },
  completeRun: { scope: 'agent', action: 'completeRun' },
  stopRun: { scope: 'agent', action: 'stopRun' },
  recordTool: { scope: 'agent', action: 'recordTool' },
  completeTool: { scope: 'agent', action: 'completeTool' },
} as const satisfies Readonly<Record<string, TransactionKind>>;

export interface PreparedAgentRun {
  readonly run: string;
  readonly commit: NodeCommit;
}
export interface SuppliedContext {
  readonly data: ContextInputData;
  /** Exact evidence for this effective input, when it came from a node. */
  readonly target?: Required<NodeAddress>;
}
export interface AgentStartOptions {
  readonly id: string;
  readonly run: string;
  readonly agent: string;
  readonly recordedBy: string;
  readonly origin?: string | null;
  readonly at: string;
  readonly provider: string;
  readonly model: string;
  readonly settings: JsonObject;
  readonly context: readonly SuppliedContext[];
  readonly enabledTools?: AgentRunData['enabledTools'];
}

/** Prepare once. A caller can compose these changes with its own in the same transaction. */
export async function prepareAgentRun(
  store: NodeStore,
  options: AgentStartOptions,
): Promise<PreparedAgentRun> {
  if (!(options.id && options.run && options.agent && options.recordedBy))
    throw new Error('Agent start requires stable identities');
  const snapshot = await store.snapshot();
  for (const author of [options.agent, options.recordedBy])
    if (!snapshot.get(author)?.data) throw new Error('Agent author is unavailable');
  const data = parseAgentRun({
    kind: 'agentRun',
    started: options.at,
    status: 'running',
    provider: options.provider,
    model: { requested: options.model },
    settings: parseAgentSettings(options.settings),
    enabledTools: options.enabledTools ?? [],
  });
  const changes: NodeChange[] = [
    {
      node: options.run,
      expected: null,
      data,
      placement: options.origin ? { parent: options.origin, order: 'agent' } : null,
      connection: {
        source: { node: options.run, transaction: options.id },
        target: snapshot.get(options.agent)!.key,
      },
    },
  ];
  const positions = new Set<number>();
  for (const entry of options.context) {
    const input = parseContextInput(entry.data);
    if (positions.has(input.position)) throw new Error('Supplied context positions must be unique');
    positions.add(input.position);
    const node = crypto.randomUUID();
    changes.push({
      node,
      expected: null,
      data: input,
      placement: { parent: options.run, order: String(input.position).padStart(12, '0') },
      connection: null,
    });
    if (entry.target) {
      if (!entry.target.transaction)
        throw new Error('Supplied context references require exact versions');
      changes.push({
        node: crypto.randomUUID(),
        expected: null,
        data: { kind: 'metadataReference', role: 'suppliedContext' },
        placement: { parent: node, order: 'a' },
        connection: { source: { node, transaction: options.id }, target: entry.target },
      });
    }
  }
  const expectedReads = Object.fromEntries(
    [options.agent, options.recordedBy].map((node) => [node, snapshot.get(node)!.key.transaction]),
  );
  return frozen(
    structuredClone({
      run: options.run,
      commit: {
        id: options.id,
        recordedBy: options.recordedBy,
        origin: options.origin ?? null,
        kind: agentOperations.startRun,
        message: null,
        undoOf: null,
        expectedReads,
        changes,
      },
    }),
  );
}

export interface SavedAgentRun {
  readonly version: NodeVersion;
  readonly data: AgentRunData;
  /** Local execution/recovery controller evidence; absence does not prove abandonment. */
  readonly ownership: 'live' | 'unknown';
  readonly tools: readonly {
    readonly version: NodeVersion;
    readonly data: ToolExecutionData;
    readonly effects: 'recorded' | 'uncertain';
  }[];
  readonly context: readonly {
    readonly version: NodeVersion;
    readonly data: ContextInputData;
    readonly references: readonly NodeVersion[];
  }[];
}
/** Read-only reconstruction never executes the model or invents an interruption. */
export async function readAgentRun(
  store: NodeStore,
  run: string,
  sequence?: number,
): Promise<SavedAgentRun | undefined> {
  const snapshot = await store.snapshot(sequence);
  const version = snapshot.get(run);
  if (!version?.data) return undefined;
  const data = parseAgentRun(version.data);
  const context = snapshot.children(run).flatMap((input) =>
    input.data?.kind === 'contextInput'
      ? [
          {
            version: input,
            data: parseContextInput(input.data),
            references: snapshot
              .children(input.key.node)
              .filter((reference) => reference.data?.kind === 'metadataReference'),
          },
        ]
      : [],
  );
  const tools = snapshot.children(run).flatMap((tool) =>
    tool.data?.kind === 'toolExecution'
      ? [
          {
            version: tool,
            data: parseToolExecution(tool.data),
            effects:
              tool.data.status === 'running' ? ('uncertain' as const) : ('recorded' as const),
          },
        ]
      : [],
  );
  return frozen({
    version,
    data,
    context,
    tools,
    ownership:
      sequence === undefined && data.status === 'running' && hasLiveAgentOwner(store, run)
        ? 'live'
        : 'unknown',
  });
}

/** Verify accepted Agent records without imposing a caller's transaction kind or origin. */
export async function verifyAgentAcceptance(
  store: NodeStore,
  prepared: PreparedAgentRun,
): Promise<void> {
  const differences = await store.changes(prepared.commit.id);
  for (const change of prepared.commit.changes) {
    const actual = differences.find((difference) => difference.node === change.node)?.after;
    if (
      !actual ||
      canonical({
        data: actual.data,
        placement: actual.placement,
        connection: actual.connection,
      }) !==
        canonical({ data: change.data, placement: change.placement, connection: change.connection })
    )
      throw new Error('Request ID reused with different contents');
  }
}

export function prepareAgentOutcome(prepared: PreparedAgentRun, data: AgentRunData): NodeCommit {
  if (data.status === 'running') throw new Error('Agent outcome must be terminal');
  const initial = prepared.commit.changes.find((change) => change.node === prepared.run)!;
  const agent = initial.connection!.target.node;
  return frozen({
    id: crypto.randomUUID(),
    recordedBy: agent,
    origin: prepared.run,
    kind: data.status === 'stopped' ? agentOperations.stopRun : agentOperations.completeRun,
    message: null,
    undoOf: null,
    changes: [{ ...initial, expected: prepared.commit.id, data: parseAgentRun(data) }],
  });
}

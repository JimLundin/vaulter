// Agent-owned historical interpretation. Reading retained records never executes their producer.
import type { NodeVersion } from '../vault/nodes/model.ts';
import type { NodeSnapshot } from '../vault/nodes/store.ts';
import { frozen } from '../vault/nodes/json.ts';
import type { AgentRunData, ContextInputData, ToolExecutionData } from './records.ts';
import { parseAgentRun, parseContextInput, parseToolExecution } from './schema.ts';

export interface RecordedAgentActivity {
  readonly version: NodeVersion;
  readonly data: AgentRunData;
  readonly tools: readonly {
    readonly version: NodeVersion;
    readonly data: ToolExecutionData;
    readonly effects: 'recorded' | 'uncertain';
  }[];
}
export interface RecordedAgentRun extends RecordedAgentActivity {
  readonly context: readonly {
    readonly version: NodeVersion;
    readonly data: ContextInputData;
    readonly references: readonly NodeVersion[];
  }[];
}
function readAgentActivityAt(
  snapshot: NodeSnapshot,
  run: string,
): RecordedAgentActivity | undefined {
  const version = snapshot.get(run);
  if (!version?.data) return;
  const data = parseAgentRun(version.data);
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
    tools,
  });
}

/** Full run inspection includes effective provider inputs; activity consumers need not decode them. */
export function readAgentRunAt(snapshot: NodeSnapshot, run: string): RecordedAgentRun | undefined {
  const activity = readAgentActivityAt(snapshot, run);
  if (!activity) return;
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
  return frozen({ ...activity, context });
}

/** Locate retained runs accepted in a caller's context without exposing Agent containment rules. */
export function agentRunsIn(
  snapshot: NodeSnapshot,
  origin: string,
  includes: (transaction: string) => boolean,
): readonly RecordedAgentActivity[] {
  return snapshot.children(origin).flatMap((version) => {
    if (version.data?.kind !== 'agentRun') return [];
    const initial = version.connection?.source.transaction;
    if (!(initial && includes(initial))) return [];
    const run = readAgentActivityAt(snapshot, version.key.node);
    return run ? [run] : [];
  });
}

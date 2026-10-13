// Recorded Tool execution owns lifecycle presentation; task owners interpret their own receipts.
import type { ReactNode } from 'react';
import { Json, Stack, Text, ToolResult } from '../ui/kit/index.ts';
import type { JsonValue } from '../vault/nodes/model.ts';
import type { ToolExecutionData } from './records.ts';

export interface RecordedToolEvidence {
  readonly name: string;
  readonly version?: string;
  readonly input: JsonValue;
  readonly output?: JsonValue;
  readonly status: ToolExecutionData['status'];
  readonly error?: string;
}

/** Static reading adapters never require executable tools, credentials or a NodeStore. */
export interface ToolPresentation {
  readonly title: string;
  readonly live: string;
  readonly done: (count: number) => string;
  readonly receipt: ReactNode;
}
export type ToolPresentationAdapter = (
  evidence: RecordedToolEvidence,
) => ToolPresentation | undefined;
export interface ToolEvidenceState extends RecordedToolEvidence {
  /** A completed effect is known locally, but its exact outcome still needs durable acceptance. */
  readonly savePending?: boolean;
}

const named = (evidence: RecordedToolEvidence) =>
  evidence.version ? `${evidence.name} (${evidence.version})` : evidence.name;
const times = (count: number) => (count === 1 ? '' : ` ${count} times`);

export function toolPresentation(
  evidence: RecordedToolEvidence,
  adapters: readonly ToolPresentationAdapter[] = [],
): ToolPresentation | undefined {
  for (const adapter of adapters) {
    const presentation = adapter(evidence);
    if (presentation) return presentation;
  }
}

export function toolStatus(evidence: ToolEvidenceState, live = false): string | undefined {
  if (evidence.savePending)
    return evidence.status === 'complete' ? 'Completed; save pending' : 'Outcome needs saving';
  if (evidence.status === 'running') return live ? undefined : 'Outcome uncertain';
  if (evidence.status === 'cancelled') return evidence.error ?? 'Cancelled';
  if (evidence.status === 'failed') return evidence.error ?? 'Failed';
  return 'Accepted';
}

/** Successful task wording belongs to its owner; uncertainty never borrows that wording. */
export function toolSummary(
  evidence: ToolEvidenceState,
  count: number,
  adapters: readonly ToolPresentationAdapter[] = [],
  live = false,
): string {
  const name = named(evidence);
  if (evidence.savePending)
    return `${name}: ${evidence.status === 'complete' ? 'completed; save pending' : 'outcome needs saving'}${times(count)}`;
  if (evidence.status === 'running')
    return `${name}: ${live ? 'running' : 'outcome uncertain'}${times(count)}`;
  if (evidence.status === 'failed') return `${name}: failed${times(count)}`;
  if (evidence.status === 'cancelled') return `${name}: cancelled${times(count)}`;
  return toolPresentation(evidence, adapters)?.done(count) ?? `used ${name}${times(count)}`;
}

export function toolLiveLabel(
  evidence: RecordedToolEvidence,
  adapters: readonly ToolPresentationAdapter[] = [],
): string {
  return `${toolPresentation(evidence, adapters)?.live ?? `Using ${named(evidence)}`}…`;
}

/** Displaying retained evidence cannot start execution or recover a pending publication. */
export function RecordedToolExecution({
  evidence,
  adapters = [],
  live = false,
}: {
  evidence: ToolEvidenceState;
  adapters?: readonly ToolPresentationAdapter[];
  live?: boolean;
}) {
  const presentation = toolPresentation(evidence, adapters);
  return (
    <ToolResult
      title={presentation?.title ?? named(evidence)}
      status={toolStatus(evidence, live)}
      error={evidence.status === 'failed' || evidence.status === 'cancelled'}
      input={evidence.input}
      output={
        presentation || evidence.output !== undefined || evidence.error ? (
          <Stack gap="sm">
            {presentation?.receipt}
            {!!evidence.error && (
              <Text size="sm" tone="danger">
                {evidence.error}
              </Text>
            )}
            {evidence.output !== undefined && <Json value={evidence.output} />}
          </Stack>
        ) : undefined
      }
    />
  );
}

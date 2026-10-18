// Agent owns effect outcome interpretation; displaying it never executes work.
import type { ReactNode } from 'react';
import type { JsonValue } from '@/application/store/index.ts';
import type { ToolExecutionData } from './activity-data.ts';

export interface RecordedToolEvidence {
  readonly name: string;
  readonly version?: string;
  readonly input: JsonValue;
  readonly output?: JsonValue;
  readonly status: ToolExecutionData['status'];
  readonly error?: string;
}

/** Static reading adapters never require executable tools, credentials or storage access. */
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

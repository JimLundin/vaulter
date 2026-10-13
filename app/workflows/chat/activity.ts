// Chat owns consecutive activity grouping; Agent and task owners supply the wording.
import type { Part } from './view.ts';
import {
  toolSummary,
  toolLiveLabel,
  type ToolPresentationAdapter,
} from '../../agent/tool-presentation.tsx';

export type ToolPart = Part & { kind: 'tool' };
export type Segment =
  | { kind: 'text'; part: Part & { kind: 'text' } }
  | { kind: 'tools'; parts: ToolPart[] };

/** The turn's parts with each run of consecutive tool calls as one segment. */
export function segments(parts: Part[]): Segment[] {
  const out: Segment[] = [];
  for (const part of parts) {
    if (part.kind === 'text') out.push({ kind: 'text', part });
    else {
      const last = out.at(-1);
      if (last?.kind === 'tools') last.parts.push(part);
      else out.push({ kind: 'tools', parts: [part] });
    }
  }
  return out;
}

/** Group only the same action version and outcome, so success cannot hide uncertain evidence. */
export function summarize(
  parts: ToolPart[],
  adapters: readonly ToolPresentationAdapter[] = [],
  live = false,
): string {
  const groups = new Map<string, { last: ToolPart; count: number }>();
  for (const part of parts) {
    const identity = JSON.stringify([
      part.name,
      part.version,
      part.status,
      !!part.savePending,
      toolSummary(part, 1, adapters, live),
    ]);
    const prior = groups.get(identity);
    groups.set(identity, { last: part, count: (prior?.count ?? 0) + 1 });
  }
  const clauses = [...groups.values()].map(({ last, count }) =>
    toolSummary(last, count, adapters, live),
  );
  const line = clauses.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The explicitly running invocation, if any. */
export const running = (parts: ToolPart[]) => parts.find((part) => part.status === 'running');

/** The owner-supplied activity label for a running call. */
export function liveLabel(
  part: ToolPart,
  adapters: readonly ToolPresentationAdapter[] = [],
): string {
  return toolLiveLabel(part, adapters);
}

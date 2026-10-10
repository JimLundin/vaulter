// A turn's tool calls as a person reads them: consecutive calls folded into one line ("Read 3 files ·
// staged 2 files"), and the call running now as a single status line. Text stays where it was said.
import type { Part } from './conversation.ts';

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

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const times = (n: number) => (n === 1 ? '' : ` ${n} times`);

/** Per tool: what it did, as a past-tense clause for n calls, and what it is doing now. */
const LABELS: Record<string, { done: (n: number) => string; live: string }> = {
  createNode: { done: (n) => `created ${count(n, 'node')}`, live: 'Creating a node' },
  readNode: { done: (n) => `read ${count(n, 'node')}`, live: 'Reading a node' },
  updateNode: { done: (n) => `updated ${count(n, 'node')}`, live: 'Updating a node' },
  search: { done: (n) => `searched${times(n)}`, live: 'Searching' },
  listNotes: { done: (n) => `listed notes${times(n)}`, live: 'Listing notes' },
  readFile: { done: (n) => `read ${count(n, 'file')}`, live: 'Reading' },
  backlinks: { done: (n) => `found backlinks${times(n)}`, live: 'Finding backlinks of' },
  writeFile: { done: (n) => `staged ${count(n, 'file')}`, live: 'Staging' },
  deleteFile: { done: (n) => `deleted ${count(n, 'file')}`, live: 'Deleting' },
  check: { done: () => 'ran the check', live: 'Running the check' },
  commit: { done: () => 'committed', live: 'Committing' },
  capture: { done: () => 'recorded the capture', live: 'Recording the capture' },
  renameNote: { done: (n) => `renamed ${count(n, 'note')}`, live: 'Renaming' },
};
const labelOf = (name: string) =>
  LABELS[name] ?? { done: (n: number) => `used ${name}${times(n)}`, live: `Using ${name}` };

/** One line for a run of calls, tools in the order first used; the check's and commit's outcome when known. */
export function summarize(parts: ToolPart[]): string {
  const counts = new Map<string, number>();
  for (const p of parts) counts.set(p.name, (counts.get(p.name) ?? 0) + 1);
  const clauses = [...counts].map(([name, n]) => {
    const last = parts.findLast((p) => p.name === name);
    if (name === 'commit' && last?.commit) return `committed ${last.commit}`;
    if (name === 'check' && last?.result && !last.error) return last.result;
    return labelOf(name).done(n);
  });
  const failed = parts.filter((p) => p.error).length;
  if (failed) clauses.push(`${failed} failed`);
  const line = clauses.join(' · ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/** The call still waiting for its result, if any. */
export const running = (parts: ToolPart[]) => parts.find((p) => p.result === undefined);

/** What a running call is doing, in a line: "Reading notes/coffee.md…". */
export function liveLabel(part: ToolPart): string {
  return `${[labelOf(part.name).live, part.input].filter(Boolean).join(' ')}…`;
}

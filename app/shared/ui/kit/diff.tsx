// A change to a file, line by line: what reviewing a draft shows. Unchanged stretches fold away
// beyond a few lines of context; added and removed lines carry a sign as well as their colour.
import { diffLines } from 'diff';
import { cn } from './lib/utils.ts';

interface Line {
  kind: 'same' | 'add' | 'del';
  text: string;
  old?: number;
  new?: number;
}
interface Fold {
  kind: 'fold';
  count: number;
  /** Where it starts, in the old file: its key. */
  from: number;
}
type Row = Line | Fold;

/** Each kind of line's sign, what it is read as, and its colours. */
const KIND = {
  add: { sign: '+', said: 'added', ink: 'text-added-ink', row: 'bg-added' },
  del: { sign: '−', said: 'removed', ink: 'text-removed-ink', row: 'bg-removed' },
  same: { sign: '', said: undefined, ink: '', row: '' },
} as const;

const keyOf = (r: Row) =>
  r.kind === 'fold' ? `fold-${r.from}` : `${r.old ?? '-'}:${r.new ?? '-'}`;

function FoldRow({ count }: { count: number }) {
  return (
    <tr className="bg-surface text-muted-foreground">
      <td colSpan={4} className="px-3 py-1">
        ⋯ {count} unchanged {count === 1 ? 'line' : 'lines'}
      </td>
    </tr>
  );
}

function LineRow({ line }: { line: Line }) {
  const k = KIND[line.kind];
  return (
    <tr className={k.row}>
      <td className="w-10 px-2 text-right text-subtle-foreground select-none">{line.old ?? ''}</td>
      <td className="w-10 px-2 text-right text-subtle-foreground select-none">{line.new ?? ''}</td>
      <td className={cn('w-4 select-none', k.ink)} aria-label={k.said}>
        {k.sign}
      </td>
      <td className="pr-3 whitespace-pre text-body">{line.text}</td>
    </tr>
  );
}

function lines(before: string, after: string): Line[] {
  const out: Line[] = [];
  let o = 1;
  let n = 1;
  for (const part of diffLines(before, after)) {
    const texts = part.value.replace(/\n$/, '').split('\n');
    for (const text of texts) {
      if (part.added) out.push({ kind: 'add', text, new: n++ });
      else if (part.removed) out.push({ kind: 'del', text, old: o++ });
      else out.push({ kind: 'same', text, old: o++, new: n++ });
    }
  }
  return out;
}

/** Unchanged lines more than `context` away from a change fold into one row. */
function folded(all: Line[], context: number): Row[] {
  const near = all.map((_, i) =>
    all.slice(Math.max(0, i - context), i + context + 1).some((l) => l.kind !== 'same'),
  );
  const out: Row[] = [];
  for (const [i, l] of all.entries()) {
    if (l.kind !== 'same' || near[i]) out.push(l);
    else {
      const prev = out.at(-1);
      if (prev?.kind === 'fold') prev.count++;
      else out.push({ kind: 'fold', count: 1, from: l.old ?? i });
    }
  }
  return out;
}

export interface CodeDiffProps {
  before: string;
  after: string;
  /** The file's path, as its title. */
  path?: string;
  /** Unchanged lines kept around each change. */
  context?: number;
}

export function CodeDiff({ before, after, path, context = 3 }: CodeDiffProps) {
  const all = lines(before, after);
  const added = all.filter((l) => l.kind === 'add').length;
  const removed = all.filter((l) => l.kind === 'del').length;
  const rows = folded(all, context);
  return (
    <figure className="m-0 overflow-hidden rounded-xl border bg-card font-mono text-xs">
      <figcaption className="flex items-center gap-3 border-b bg-surface px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-foreground">{path ?? 'Changes'}</span>
        <span className="text-added-ink">+{added}</span>
        <span className="text-removed-ink">−{removed}</span>
      </figcaption>
      {added + removed === 0 ? (
        <p className="m-0 px-3 py-2 text-muted-foreground">No changes</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map((r) =>
                r.kind === 'fold' ? (
                  <FoldRow key={keyOf(r)} count={r.count} />
                ) : (
                  <LineRow key={keyOf(r)} line={r} />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}

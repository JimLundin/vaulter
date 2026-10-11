// The vault's recorded node history, newest first. Generic: it names changed nodes by their kind and
// common label fields, never interpreting another workflow's records; Product supplies undo policy.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  HistoryEntry,
  Overlay,
  Row,
  Stack,
  Text,
} from '../../ui/kit/index.ts';
import type { NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeDifference } from '../../vault/nodes/store.ts';
import type { NodeHistoryEntry } from './nodes.ts';

export interface NodeHistorySource {
  readonly entries: (options?: {
    readonly beforeSequence?: number;
    readonly limit?: number;
  }) => Promise<readonly NodeHistoryEntry[]>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly canUndo?: (entry: NodeHistoryEntry) => boolean;
  readonly undo?: (entry: NodeHistoryEntry) => Promise<unknown>;
}

const PAGE = 25;
const SHOWN = 100;

/** A version's readable name: its first common label field, else its identity. */
export function labelOf(version: NodeVersion | null | undefined): string {
  const data = version?.data;
  for (const field of ['title', 'name', 'label', 'what', 'text', 'url', 'key'] as const) {
    const value = data?.[field];
    if (typeof value === 'string' && value.trim())
      return value.trim().split('\n')[0]!.slice(0, 120);
  }
  return version?.key.node ?? '';
}
export function describe({ before, after }: NodeDifference): string {
  const action =
    before === null
      ? 'Created'
      : after.data === null
        ? 'Deleted'
        : before.data === null
          ? 'Restored'
          : 'Updated';
  const kind = String((after.data ?? before?.data)?.kind ?? 'node');
  return `${action} ${kind}: ${labelOf(after.data ? after : before)}`;
}
const when = (instant: string) =>
  new Date(instant).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function NodeHistory({ history }: { history: NodeHistorySource }) {
  const [list, setList] = useState<readonly NodeHistoryEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<NodeHistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const oldest = useRef<number | undefined>(undefined);
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const all: NodeHistoryEntry[] = [];
      let beforeSequence: number | undefined;
      let page: readonly NodeHistoryEntry[];
      do {
        // biome-ignore lint/performance/noAwaitInLoops: each cursor depends on the preceding page.
        page = await history.entries({ beforeSequence, limit: PAGE });
        if (request !== generation.current) return;
        all.push(...page);
        beforeSequence = page.at(-1)?.transaction.sequence;
      } while (
        page.length === PAGE &&
        beforeSequence !== undefined &&
        oldest.current !== undefined &&
        beforeSequence > oldest.current
      );
      oldest.current = all.at(-1)?.transaction.sequence;
      setList(all);
      setMore(page.length === PAGE);
      setError('');
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [history]);
  useEffect(() => {
    oldest.current = undefined;
    setList(null);
    void reload();
    const unsubscribe = history.subscribe(() => void reload());
    return () => {
      generation.current++;
      unsubscribe();
    };
  }, [history, reload]);
  const earlier = async () => {
    const last = list?.at(-1);
    if (!last || loading) return;
    const request = ++generation.current;
    setLoading(true);
    try {
      const entries = await history.entries({
        beforeSequence: last.transaction.sequence,
        limit: PAGE,
      });
      if (request !== generation.current) return;
      oldest.current = entries.at(-1)?.transaction.sequence ?? last.transaction.sequence;
      setList((current) => [...(current ?? []), ...entries]);
      setMore(entries.length === PAGE);
      setError('');
    } catch (e) {
      if (request === generation.current) setError(String(e));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  };
  const undo = async () => {
    if (!(confirm && history.undo) || busy) return;
    setBusy(true);
    setError('');
    try {
      await history.undo(confirm);
      setConfirm(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {!!error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {list === null ? (
        <Text tone="subtle">Loading history…</Text>
      ) : !list.length ? (
        <Text tone="muted">No recorded changes yet.</Text>
      ) : (
        <Stack gap="xl">
          {list.map((entry) => (
            <TransactionItem
              key={entry.transaction.id}
              entry={entry}
              expanded={open.has(entry.transaction.id)}
              onExpand={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (!next.delete(entry.transaction.id)) next.add(entry.transaction.id);
                  return next;
                })
              }
              canUndo={!!history.undo && !!history.canUndo?.(entry)}
              onUndo={() => setConfirm(entry)}
            />
          ))}
          {more && (
            <Row justify="center">
              <Button variant="outline" disabled={loading} onClick={() => void earlier()}>
                Load earlier
              </Button>
            </Row>
          )}
        </Stack>
      )}
      <Overlay
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={`Undo “${confirm?.transaction.message?.split('\n')[0] ?? ''}”?`}
        description="This records a new change that restores the previous versions."
      >
        <Row justify="end">
          <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void undo()}>
            {busy ? 'Undoing…' : 'Undo'}
          </Button>
        </Row>
      </Overlay>
    </>
  );
}

/** One accepted transaction, independent of the list's loading and pagination. */
export function TransactionItem({
  entry,
  expanded,
  onExpand,
  canUndo,
  onUndo,
}: {
  entry: NodeHistoryEntry;
  expanded: boolean;
  onExpand: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { transaction } = entry;
  const title =
    transaction.message?.split('\n')[0] || `${transaction.kind.scope}.${transaction.kind.action}`;
  return (
    <HistoryEntry
      key={transaction.id}
      title={title}
      date={`${when(transaction.recordedAt)} · ${labelOf(entry.author)}`}
      sha={`#${transaction.sequence}`}
      expanded={expanded}
      onExpand={onExpand}
      onRevert={canUndo ? onUndo : undefined}
    >
      {expanded && (
        <Stack gap="xs">
          {transaction.message?.includes('\n') && (
            <Text tone="muted">{transaction.message.split('\n').slice(1).join('\n').trim()}</Text>
          )}
          {!!entry.origin && <Text tone="subtle">From {labelOf(entry.origin)}</Text>}
          {entry.differences.slice(0, SHOWN).map((difference) => (
            <Text key={difference.node}>{describe(difference)}</Text>
          ))}
          {entry.differences.length > SHOWN && (
            <Text tone="subtle">and {entry.differences.length - SHOWN} more changes</Text>
          )}
        </Stack>
      )}
    </HistoryEntry>
  );
}

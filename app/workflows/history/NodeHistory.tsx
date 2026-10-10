// The vault's recorded node history, newest first. Generic: it names changed nodes by their kind and
// common label fields, never interpreting another workflow's records; Product supplies undo policy.
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  HistoryEntry,
  Overlay,
  Row,
  Stack,
  Text,
  toast,
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
  const reload = useCallback(
    () =>
      history.entries({ limit: PAGE }).then(
        (entries) => {
          setList(entries);
          setMore(entries.length === PAGE);
        },
        (e: unknown) => setError(String(e)),
      ),
    [history],
  );
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) void reload();
    };
    refresh();
    const unsubscribe = history.subscribe(refresh);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [history, reload]);
  const earlier = async () => {
    const last = list?.at(-1);
    if (!last) return;
    try {
      const entries = await history.entries({
        beforeSequence: last.transaction.sequence,
        limit: PAGE,
      });
      setList([...(list ?? []), ...entries]);
      setMore(entries.length === PAGE);
    } catch (e) {
      setError(String(e));
    }
  };
  const undo = async () => {
    if (!(confirm && history.undo) || busy) return;
    setBusy(true);
    setError('');
    try {
      await history.undo(confirm);
      setConfirm(null);
      toast.success('Undone');
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
          {list.map((entry) => {
            const { transaction } = entry;
            const expanded = open.has(transaction.id);
            const title =
              transaction.message?.split('\n')[0] ||
              `${transaction.kind.scope}.${transaction.kind.action}`;
            return (
              <HistoryEntry
                key={transaction.id}
                title={title}
                date={`${when(transaction.recordedAt)} · ${labelOf(entry.author)}`}
                sha={`#${transaction.sequence}`}
                expanded={expanded}
                onExpand={() =>
                  setOpen((current) => {
                    const next = new Set(current);
                    if (!next.delete(transaction.id)) next.add(transaction.id);
                    return next;
                  })
                }
                onRevert={
                  history.undo && history.canUndo?.(entry) ? () => setConfirm(entry) : undefined
                }
              >
                {expanded && (
                  <Stack gap="xs">
                    {transaction.message?.includes('\n') && (
                      <Text tone="muted">
                        {transaction.message.split('\n').slice(1).join('\n').trim()}
                      </Text>
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
          })}
          {more && (
            <Row justify="center">
              <Button variant="outline" onClick={() => void earlier()}>
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

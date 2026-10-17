// Shared recorded History presentation, with a compatibility adapter for Node-only callers.
// Application supplies resolved records and guarded compensation; this list never executes producers.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  ExpandableRow,
  RowAction,
  Overlay,
  Row,
  Stack,
  Text,
} from '../../../ui/kit/index.ts';
import type { NodeHistoryEntry } from './nodes.ts';
import {
  nodeHistoryEntry,
  type HistoryEntry,
  type HistorySource,
  type NodeHistorySource,
} from './entries.ts';
export type { NodeHistorySource } from './entries.ts';

const PAGE = 25;
const SHOWN = 100;

const when = (instant: string) =>
  new Date(instant).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function NodeHistory({ history }: { history: NodeHistorySource }) {
  const source = useMemo<HistorySource>(
    () => ({
      subscribe: history.subscribe,
      entries: async (options) =>
        (
          await history.entries({
            beforeSequence: options?.before ? Number(options.before) : undefined,
            limit: options?.limit,
          })
        ).map((entry) => ({
          ...nodeHistoryEntry(
            entry,
            history.undo && history.canUndo?.(entry) ? () => history.undo!(entry) : undefined,
          ),
          key: String(entry.transaction.sequence),
        })),
    }),
    [history],
  );
  return <HistoryList history={source} />;
}

export function HistoryList({ history }: { history: HistorySource }) {
  const [list, setList] = useState<readonly HistoryEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const oldest = useRef<string | undefined>(undefined);
  const generation = useRef(0);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    try {
      const all: HistoryEntry[] = [];
      let before: string | undefined;
      let page: readonly HistoryEntry[];
      do {
        // biome-ignore lint/performance/noAwaitInLoops: each cursor depends on the preceding page.
        page = await history.entries({ before, limit: PAGE });
        if (request !== generation.current) return;
        all.push(...page);
        before = page.at(-1)?.key;
      } while (
        page.length === PAGE &&
        before !== undefined &&
        oldest.current !== undefined &&
        !all.some((entry) => entry.key === oldest.current)
      );
      oldest.current = all.at(-1)?.key;
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
        before: last.key,
        limit: PAGE,
      });
      if (request !== generation.current) return;
      oldest.current = entries.at(-1)?.key ?? last.key;
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
    if (!confirm?.undo || busy) return;
    setBusy(true);
    setError('');
    try {
      await confirm.undo();
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
            <HistoryTransactionItem
              key={entry.key}
              entry={entry}
              expanded={open.has(entry.key)}
              onExpand={() =>
                setOpen((current) => {
                  const next = new Set(current);
                  if (!next.delete(entry.key)) next.add(entry.key);
                  return next;
                })
              }
              canUndo={!!entry.undo}
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
        title={`Undo “${confirm?.title ?? ''}”?`}
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
  return (
    <HistoryTransactionItem
      entry={nodeHistoryEntry(entry)}
      expanded={expanded}
      onExpand={onExpand}
      canUndo={canUndo}
      onUndo={onUndo}
    />
  );
}

function HistoryTransactionItem({
  entry,
  expanded,
  onExpand,
  canUndo,
  onUndo,
}: {
  entry: HistoryEntry;
  expanded: boolean;
  onExpand: () => void;
  canUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <ExpandableRow
      title={entry.title}
      metadata={
        <Text size="xs" tone="muted">
          {when(entry.recordedAt)}
          {entry.author ? ` · ${entry.author}` : ''} ·{' '}
          <Text as="span" size="xs" tone="muted" mono={true}>
            #{entry.sequence}
          </Text>
        </Text>
      }
      expanded={expanded}
      onExpand={onExpand}
      actions={
        canUndo ? (
          <RowAction
            label="Revert"
            accessibleLabel={`Undo transaction #${entry.sequence}`}
            icon="undo"
            onClick={onUndo}
          />
        ) : undefined
      }
    >
      {expanded && (
        <Stack gap="xs">
          {!!entry.origin && <Text tone="subtle">From {entry.origin}</Text>}
          {entry.details.slice(0, SHOWN).map((detail, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positions belong to this immutable accepted transaction.
            <Text key={`${index}:${detail}`}>{detail}</Text>
          ))}
          {entry.details.length > SHOWN && (
            <Text tone="subtle">and {entry.details.length - SHOWN} more changes</Text>
          )}
        </Stack>
      )}
    </ExpandableRow>
  );
}

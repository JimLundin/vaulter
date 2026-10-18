// Shared recorded EAV History presentation.
// Application supplies resolved records and guarded compensation; this list never executes producers.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  CodeDiff,
  Details,
  Heading,
  Surface,
  AlertDescription,
  Button,
  ExpandableRow,
  RowAction,
  Overlay,
  Row,
  Stack,
  Text,
} from '@/shared/ui/kit/index.ts';
import { SaveError } from '@/core/store/index.ts';
import type { HistoryEntry, HistorySource } from '@/core/history/entries.ts';

const PAGE = 25;

const day = (instant: string) =>
  new Date(instant).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
function groupDays(entries: readonly HistoryEntry[]) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const date = day(entry.recordedAt);
    const group = groups.get(date) ?? [];
    group.push(entry);
    groups.set(date, group);
  }
  return [...groups];
}
const when = (instant: string) =>
  new Date(instant).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

export function HistoryList({ history }: { history: HistorySource }) {
  const [list, setList] = useState<readonly HistoryEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<HistoryEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
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
      setRetrying(false);
      await reload();
    } catch (e) {
      setRetrying(e instanceof SaveError);
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
        <Stack gap="lg">
          {groupDays(list).map(([date, entries]) => (
            <Surface key={date} variant="grouped" as="section" aria-label={date}>
              <Surface variant="groupHeading">
                <Heading level={2}>{date}</Heading>
              </Surface>
              <Surface>
                {entries.map((entry) => (
                  <TransactionItem
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
                    onUndo={() => {
                      setConfirm(entry);
                      setRetrying(false);
                    }}
                  />
                ))}
              </Surface>
            </Surface>
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
        {!!error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Row justify="end">
          <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void undo()}>
            {busy ? 'Saving…' : retrying ? 'Retry save' : 'Undo'}
          </Button>
        </Row>
      </Overlay>
    </>
  );
}

/** One accepted transaction, independent of list loading and pagination. */
export function TransactionItem({
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
          {entry.author ? ` · ${entry.author}` : ''}
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
          <Details
            items={[
              ['Recorded', when(entry.recordedAt)],
              ...(entry.author ? [['Author', entry.author] as [string, string]] : []),
              ['Transaction', `#${entry.sequence}`],
              ...(entry.origin ? [['From', entry.origin] as [string, string]] : []),
            ]}
          />
          {entry.changes
            ? entry.changes.map((change, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positions belong to this immutable accepted transaction.
                <Stack key={index} gap="sm">
                  <Text size="sm" weight="medium">
                    {change.title}
                  </Text>
                  {change.fields.map((field) => (
                    <CodeDiff
                      key={field.label}
                      path={field.label}
                      before={field.before}
                      after={field.after}
                    />
                  ))}
                </Stack>
              ))
            : entry.details.map((detail, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: positions belong to this immutable accepted transaction.
                <Text key={index} size="sm">
                  {detail}
                </Text>
              ))}
        </Stack>
      )}
    </ExpandableRow>
  );
}

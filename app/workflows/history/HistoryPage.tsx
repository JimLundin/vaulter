// History is a removable workflow. It receives only the live vault.
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  HistoryEntry,
  HistorySurface,
  Overlay,
  Row,
  Stack,
  Text,
  UnifiedDiff,
  toast,
} from '../../ui/kit/index.ts';
import { type Vault, Conflict, CheckFailed } from '../../vault/index.ts';
const shortSha = (sha: string) => (/^[0-9a-f]{8,}$/i.test(sha) ? sha.slice(0, 7) : sha);
type Commit = { sha: string; message: string; date: string };
export function HistoryPage({ vault }: { vault: Vault }) {
  const [list, setList] = useState<Commit[] | null>(null);
  const [open, setOpen] = useState<Record<string, { filename: string; patch?: string }[]>>({});
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<Commit | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    vault.history?.().then(
      (commits) => {
        if (active) setList(commits);
      },
      (e) => {
        if (active) setError(String(e));
      },
    );
    return () => {
      active = false;
    };
  }, [vault]);
  const show = async (sha: string) => {
    if (open[sha]) {
      setOpen(({ [sha]: _, ...rest }) => rest);
      return;
    }
    try {
      const files = await vault.patch!(sha);
      setOpen((current) => ({ ...current, [sha]: files }));
    } catch (e) {
      setError(String(e));
    }
  };
  const revert = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    setError('');
    try {
      const sha = await vault.revert!(confirm.sha);
      setList(await vault.history!());
      setConfirm(null);
      toast.success(`Reverted in ${shortSha(sha)}`);
    } catch (e) {
      setError(
        e instanceof Conflict
          ? `Can't revert: ${e.paths.join(', ')} changed since.`
          : e instanceof CheckFailed
            ? "Can't revert: the check would fail."
            : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <HistorySurface>
      {!!error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!vault.history ? (
        <Text tone="muted">History is unavailable for this vault.</Text>
      ) : list === null ? (
        <Text tone="subtle">Loading commits…</Text>
      ) : !list.length ? (
        <Text tone="muted">No commits yet.</Text>
      ) : (
        <Stack gap="xl">
          {list.map((commit) => (
            <HistoryEntry
              key={commit.sha}
              title={commit.message.split('\n')[0]}
              date={new Date(commit.date).toLocaleString('en-GB', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              sha={shortSha(commit.sha)}
              expanded={!!open[commit.sha]}
              onExpand={() => {
                show(commit.sha).catch((e) => setError(String(e)));
              }}
              onRevert={vault.revert ? () => setConfirm(commit) : undefined}
            >
              {open[commit.sha]?.map((file) => (
                <UnifiedDiff key={file.filename} path={file.filename} patch={file.patch} />
              ))}
            </HistoryEntry>
          ))}
        </Stack>
      )}
      <Overlay
        open={!!confirm}
        onClose={() => {
          if (!busy) setConfirm(null);
        }}
        title={`Revert “${confirm?.message.split('\n')[0] ?? ''}”?`}
        description="This creates a new commit that undoes the change."
      >
        <Row justify="end">
          <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={revert}>
            {busy ? 'Reverting…' : 'Revert'}
          </Button>
        </Row>
      </Overlay>
    </HistorySurface>
  );
}

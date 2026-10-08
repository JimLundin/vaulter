// History is a removable workflow. It receives only the live vault.
import { useEffect, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Button,
  Heading,
  Icon,
  Overlay,
  Page,
  Row,
  Stack,
  Text,
  UnifiedDiff,
  useIsMobile,
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
  const mobile = useIsMobile();
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
    <Page>
      <Heading level={1} serif={true}>
        History
      </Heading>
      <Text tone="muted">Commits made from this app, newest first.</Text>
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
            <Stack key={commit.sha}>
              <Row justify="between">
                <Button
                  variant="ghost"
                  onClick={() => show(commit.sha)}
                  aria-expanded={!!open[commit.sha]}
                >
                  <Icon name={open[commit.sha] ? 'chevron-left' : 'chevron-right'} />
                  {commit.message.split('\n')[0]}
                </Button>
                {!!vault.revert && (
                  <Button variant="outline" size="sm" onClick={() => setConfirm(commit)}>
                    <Icon name="undo" />
                    Revert
                  </Button>
                )}
              </Row>
              <Text size="xs" tone="subtle" mono={true}>
                {new Date(commit.date).toLocaleString('en-GB', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}{' '}
                · {shortSha(commit.sha)}
              </Text>
              {open[commit.sha]?.map((file) => (
                <UnifiedDiff key={file.filename} path={file.filename} patch={file.patch} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
      <Overlay
        mobile={mobile}
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
    </Page>
  );
}

// Commits made from the app (by hand or by the agent), newest first: what each changed, and a revert.
import { useEffect, useState } from 'react';
import { useWriter } from '../../core/host.tsx';
import { Conflict, CheckFailed } from '../../core/backend.ts';
import { Confirm, DiffLines } from './parts.tsx';
import { Empty, Loading, PageHeader, Section } from '@/components/layout.tsx';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Button } from '@/components/ui/button.tsx';

export function History() {
  const w = useWriter();
  const [list, setList] = useState<{ sha: string; message: string; date: string }[] | null>(null);
  const [open, setOpen] = useState<Record<string, { filename: string; patch?: string }[]>>({});
  const [note, setNote] = useState('');
  const load = () => w.history?.().then(setList, (e) => setNote(String(e)));
  // biome-ignore lint/correctness/useExhaustiveDependencies: load once on mount; load is a fresh closure every render
  useEffect(() => {
    load();
  }, []);
  if (!w.history)
    return (
      <div className="v-changes">
        <PageHeader title="History" />
        <Empty>
          In dev, see <code className="font-mono text-sm not-italic">git log</code>.
        </Empty>
      </div>
    );

  const show = async (sha: string) =>
    setOpen({ ...open, [sha]: open[sha] ? undefined! : await w.patch!(sha) });
  const revert = async (c: { sha: string; message: string }) => {
    try {
      const sha = await w.revert!(c.sha);
      setNote(`Reverted in ${sha.slice(0, 7)}.`);
      load();
    } catch (e) {
      setNote(
        e instanceof Conflict
          ? `Can't revert: ${e.paths.join(', ')} changed since.`
          : e instanceof CheckFailed
            ? "Can't revert: the check would fail."
            : (e as Error).message,
      );
    }
  };
  return (
    <div className="v-changes">
      <PageHeader title="History" lede="Commits made from this app, newest first." />
      {!!note && (
        <Alert className="mb-6">
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
      {list === null ? (
        <Loading />
      ) : !list.length ? (
        <Empty>None yet.</Empty>
      ) : (
        <Section title="Commits" count={list.length}>
          <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border p-0">
            {list.map((c) => {
              const [subject] = c.message.split('\n');
              return (
                <li key={c.sha}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0 flex-1 basis-64">
                      <div className="break-words font-medium">{subject}</div>
                      <div className="mt-0.5 text-sm text-faint">
                        {new Date(c.date).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}{' '}
                        · <code className="font-mono text-xs">{c.sha.slice(0, 7)}</code>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => show(c.sha)}>
                        {open[c.sha] ? 'hide' : 'changes'}
                      </Button>
                      <Confirm
                        trigger={
                          <Button size="sm" variant="outline">
                            revert
                          </Button>
                        }
                        title={`Revert "${subject}"?`}
                        description="This makes a new commit that undoes it."
                        action="Revert"
                        onConfirm={() => revert(c)}
                      />
                    </div>
                  </div>
                  {!!open[c.sha] && (
                    <div className="grid gap-3 border-t bg-surface/50 p-3">
                      {open[c.sha].map((f) => (
                        <div key={f.filename} className="overflow-hidden rounded-md border">
                          <div className="break-all border-b bg-surface px-3 py-1.5 font-mono text-xs font-medium text-muted-foreground">
                            {f.filename}
                          </div>
                          <DiffLines lines={(f.patch ?? '').split('\n')} />
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}

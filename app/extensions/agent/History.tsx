// Commits made from the app (by hand or by the agent), newest first: what each changed, and a revert.
import { useEffect, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from 'cn';
import { useWriter } from '../../core/host.tsx';
import { Conflict, CheckFailed } from '../../core/backend.ts';
import { Confirm, DiffLines, shortSha } from './parts.tsx';
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

  const show = async (sha: string) => {
    if (open[sha]) return setOpen(({ [sha]: _, ...rest }) => rest);
    const files = await w.patch!(sha);
    setOpen((o) => ({ ...o, [sha]: files }));
  };
  const revert = async (c: { sha: string; message: string }) => {
    setNote('');
    try {
      const sha = await w.revert!(c.sha);
      await load();
      toast.success(`Reverted in ${shortSha(sha)}`, {
        action: {
          label: 'Show',
          onClick: async () => {
            await show(sha);
            document.querySelector<HTMLElement>(`[data-sha="${sha}"]`)?.focus();
          },
        },
      });
    } catch (e) {
      setNote(
        e instanceof Conflict
          ? `Can't revert: ${e.paths.join(', ')} changed since.`
          : e instanceof CheckFailed
            ? "Can't revert: the check would fail."
            : (e as Error).message,
      );
      toast.error("Couldn't revert");
    }
  };
  return (
    <div className="v-changes">
      <PageHeader title="History" lede="Commits made from this app, newest first." />
      {!!note && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}
      {list === null ? (
        <Loading shape="list" />
      ) : !list.length ? (
        <Empty>None yet.</Empty>
      ) : (
        <Section title="Commits" count={list.length}>
          <ul className="m-0 list-none divide-y overflow-hidden rounded-lg border p-0">
            {list.map((c) => {
              const [subject] = c.message.split('\n');
              return (
                <li key={c.sha}>
                  <div className="flex items-center gap-2 py-1.5 pr-3 pl-1.5">
                    <button
                      type="button"
                      data-nav={true}
                      data-sha={c.sha}
                      aria-expanded={!!open[c.sha]}
                      className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-left outline-none hover:bg-accent/60 focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
                      onClick={() => show(c.sha)}
                    >
                      <ChevronRightIcon
                        className={cn(
                          'mt-0.5 size-4 shrink-0 text-faint transition-transform',
                          !!open[c.sha] && 'rotate-90',
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block break-words font-medium">{subject}</span>
                        <span className="mt-0.5 block text-sm text-faint">
                          {new Date(c.date).toLocaleString('en-GB', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}{' '}
                          · <code className="font-mono text-xs">{shortSha(c.sha)}</code>
                        </span>
                      </span>
                    </button>
                    <div className="flex gap-2">
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

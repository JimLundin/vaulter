// Staged edits: each file's diff, what the check says about them, and the commit.
import { useEffect, useId, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { structuredPatch } from 'diff';
import { hrefForId } from '../../../core/paths.ts';
import { applyOverlay, newProblems } from '../../core/writer.ts';
import { CheckFailed, Conflict } from '../../core/backend.ts';
import { useWriter } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { later } from '../../core/later.ts';
import { Confirm, DiffLines } from './parts.tsx';
import { Empty, ErrorState, Loading, PageHeader, Section } from '@/components/layout.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';

function Diff({ before, after }: { before: string; after: string }) {
  const p = structuredPatch('a', 'b', before, after, '', '', { context: 2 });
  return (
    <DiffLines
      lines={p.hunks.flatMap((h) => [
        `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`,
        ...h.lines,
      ])}
    />
  );
}

export function Changes() {
  const w = useWriter();
  const staged = Object.entries(w.overlay?.files ?? {});
  const [problems, setProblems] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  useEffect(() => {
    setProblems(null);
    if (!w.overlay) return;
    let live = true;
    later(newProblems(w.base, applyOverlay(w.base, w.overlay)).then((p) => live && setProblems(p)));
    return () => {
      live = false;
    };
  }, [w.overlay, w.base]);

  const commit = async () => {
    setState({ busy: true });
    try {
      const sha = await w.commit!(
        message || `vault: ${staged.map(([p]) => p.replace(/\.mdx?$/, '')).join(', ')}`,
      );
      setMessage('');
      setState({ done: sha });
    } catch (e) {
      setState({
        error:
          e instanceof CheckFailed
            ? 'The check fails; nothing was committed.'
            : e instanceof Conflict
              ? `Changed on main meanwhile: ${e.paths.join(', ')}. Reload the file and stage it again.`
              : (e as Error).message,
      });
    }
  };

  if (!staged.length)
    return (
      <div className="v-changes">
        <PageHeader title="Changes" />
        {state.done ? (
          <p className="text-muted-foreground">
            Committed <code className="font-mono text-sm">{state.done.slice(0, 7)}</code>. See{' '}
            <a className="text-primary no-underline hover:underline" href={link('/history/')}>
              History
            </a>
            .
          </p>
        ) : (
          <Empty>Nothing staged. Edit a note from its page.</Empty>
        )}
      </div>
    );
  return (
    <div className="v-changes">
      <PageHeader
        title="Changes"
        lede="Staged edits, not yet committed. Review each diff, then commit them as one step."
      />
      <Section title="Staged" count={staged.length}>
        <div className="grid gap-4">
          {staged.map(([path, text]) => {
            const before = w.base.find((f) => f.path === path)?.text ?? '';
            return (
              <div key={path} className="overflow-hidden rounded-lg border">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b bg-surface px-3 py-2">
                  <a
                    className="min-w-0 break-all font-mono text-sm font-medium text-foreground no-underline hover:underline"
                    href={link(hrefForId(path.replace(/\.mdx?$/, '')))}
                  >
                    {path}
                  </a>
                  <Badge
                    variant="outline"
                    className={
                      text === null ? 'text-destructive' : before ? undefined : 'text-success'
                    }
                  >
                    {text === null ? 'deleted' : before ? 'edited' : 'new'}
                  </Badge>
                  <div className="ml-auto flex gap-2">
                    <Button asChild={true} size="sm" variant="outline">
                      <a
                        className="text-foreground no-underline"
                        href={link(`/edit/${encodeURIComponent(path)}/`)}
                      >
                        edit
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => w.unstage(path)}>
                      unstage
                    </Button>
                  </div>
                </div>
                <Diff before={before} after={text ?? ''} />
              </div>
            );
          })}
        </div>
      </Section>
      <Section title="Commit">
        <div className="grid gap-4">
          {problems === null ? (
            <Loading>Checking…</Loading>
          ) : problems.length ? (
            <ErrorState>
              <p className="m-0">
                The check finds {problems.length} new{' '}
                {problems.length === 1 ? 'problem' : 'problems'}:
              </p>
              <ul className="m-0 mt-1 list-disc pl-5">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </ErrorState>
          ) : (
            <p className="m-0 flex items-center gap-2 font-medium text-success">
              <CheckIcon className="size-4" />
              The check passes.
            </p>
          )}
          {w.commit ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor={id}>Commit message</Label>
                <Input
                  id={id}
                  type="text"
                  placeholder={`vault: ${staged.map(([p]) => p.replace(/\.mdx?$/, '')).join(', ')}`}
                  value={message}
                  onChange={(e) => setMessage(e.currentTarget.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={state.busy || problems === null || problems.length > 0}
                  onClick={commit}
                >
                  {state.busy ? 'Committing…' : 'Commit to main'}
                </Button>
                <Confirm
                  trigger={
                    <Button variant="ghost" className="ml-auto text-destructive">
                      Discard all
                    </Button>
                  }
                  title="Discard every staged edit?"
                  description={`The edits to ${staged.length} ${staged.length === 1 ? 'file are' : 'files are'} dropped; this can't be undone.`}
                  action="Discard all"
                  destructive={true}
                  onConfirm={() => w.discard()}
                />
              </div>
            </>
          ) : (
            <p className="m-0 text-sm text-faint">
              In dev the files are the working tree: commit with git.
            </p>
          )}
          {!!state.error && <ErrorState>{state.error}</ErrorState>}
        </div>
      </Section>
    </div>
  );
}

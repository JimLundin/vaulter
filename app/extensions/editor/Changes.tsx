// Staged edits: each file's diff, what the check says about them, and the commit.
import { useEffect, useId, useState } from 'react';
import { CheckIcon } from 'lucide-react';
import { structuredPatch } from 'diff';
import { toast } from 'sonner';
import { hrefForId } from '../notes/model/paths.ts';
import { CheckFailed, Conflict } from '../../core/backend.ts';
import { useWriter } from '../../core/host.tsx';
import { go, link } from '../../core/route.ts';
import { later } from '../../core/later.ts';
import { Confirm, DiffLines, shortSha } from './parts.tsx';
import { Empty, ErrorState, Loading, PageHeader, Section } from '@/components/layout.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { editPage, historyPage } from './routes.ts';

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

/** Focuses the commit message once Changes is on screen (the "Commit staged changes" command). */
export function focusCommit(tries = 20) {
  const el = document.querySelector<HTMLInputElement>('[data-commit-message]');
  if (el) el.focus();
  else if (tries > 0) requestAnimationFrame(() => focusCommit(tries - 1));
}

export function Changes() {
  const w = useWriter();
  const staged = Object.entries(w.overlay?.files ?? {});
  const [problems, setProblems] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
  const id = useId();
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: string }>({});
  // biome-ignore lint/correctness/useExhaustiveDependencies: the overlay and the base are the triggers (an edit, a sync); w.problems reads both itself
  useEffect(() => {
    setProblems(null);
    if (!w.overlay) return;
    let live = true;
    later(w.problems().then((p) => live && setProblems(p)));
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
      toast.success(`Committed ${shortSha(sha)}`, {
        action: w.history ? { label: 'History', onClick: () => go(historyPage.href()) } : undefined,
      });
    } catch (e) {
      setState({
        error:
          e instanceof CheckFailed
            ? 'The check fails; nothing was committed.'
            : e instanceof Conflict
              ? `Changed on main meanwhile: ${e.paths.join(', ')}. Reload the file and stage it again.`
              : (e as Error).message,
      });
      toast.error(
        e instanceof CheckFailed
          ? 'The check fails'
          : e instanceof Conflict
            ? 'Changed on main meanwhile'
            : 'The commit failed',
      );
    }
  };
  const canCommit = !state.busy && problems !== null && problems.length === 0;
  const unstage = async (path: string, text: string | null) => {
    await w.unstage(path);
    toast(`Unstaged ${path}`, { action: { label: 'Undo', onClick: () => w.stage(path, text) } });
  };
  const discardAll = async () => {
    const files = staged;
    await w.discard();
    toast(`Discarded ${files.length} staged ${files.length === 1 ? 'edit' : 'edits'}`, {
      action: {
        label: 'Undo',
        onClick: async () => {
          // biome-ignore lint/performance/noAwaitInLoops: one at a time; each stage builds on the overlay the last one wrote
          for (const [p, t] of files) await w.stage(p, t);
        },
      },
    });
  };

  if (!staged.length)
    return (
      <div className="v-changes">
        <PageHeader title="Changes" />
        {state.done ? (
          <Empty>
            Nothing staged. Committed{' '}
            <code className="font-mono text-sm">{shortSha(state.done)}</code>.
          </Empty>
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
                    data-nav={true}
                    className="-mx-1 min-w-0 break-all rounded-sm px-1 font-mono text-sm font-medium text-foreground no-underline hover:underline data-[nav]:focus-visible:bg-accent data-[nav]:focus-visible:outline-2"
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
                        href={link(editPage.href({ file: path }))}
                      >
                        edit
                      </a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => unstage(path, text)}>
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
            <Loading shape="list">Checking…</Loading>
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
                  data-commit-message={true}
                  type="text"
                  placeholder={`vault: ${staged.map(([p]) => p.replace(/\.mdx?$/, '')).join(', ')}`}
                  value={message}
                  onChange={(e) => setMessage(e.currentTarget.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canCommit && commit()}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={!canCommit} onClick={commit}>
                  {state.busy ? 'Committing…' : 'Commit to main'}
                </Button>
                <Confirm
                  trigger={
                    <Button variant="ghost" className="ml-auto text-destructive">
                      Discard all
                    </Button>
                  }
                  title="Discard every staged edit?"
                  description={`The edits to ${staged.length} ${staged.length === 1 ? 'file are' : 'files are'} dropped.`}
                  action="Discard all"
                  destructive={true}
                  onConfirm={discardAll}
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

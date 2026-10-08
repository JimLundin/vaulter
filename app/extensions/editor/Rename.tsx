// Rename a note, or switch it between .md and .mdx: stages the move and every file whose links or
// frontmatter follow it (app/extensions/notes/model/rename.ts), to review in Changes and commit as one step.
import { useId, useMemo, useState } from 'react';
import { renameNote } from '../notes/model/rename.ts';
import { applyOverlay } from '../../core/writer.ts';
import { useWriter } from '../../core/host.tsx';
import { toast } from 'sonner';
import { go, link } from '../../core/route.ts';
import { ErrorState, PageHeader, Section } from '@/components/layout.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Checkbox } from '@/components/ui/checkbox.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { changesPage } from './routes.ts';

const code = 'rounded-sm bg-surface px-1 py-0.5 font-mono text-sm';

export function Rename({ path }: { path: string }) {
  const w = useWriter();
  const [name, setName] = useState(path.replace(/\.mdx?$/, ''));
  const [mdx, setMdx] = useState(path.endsWith('.mdx'));
  const id = useId();
  const to = `${name.trim()}.${mdx ? 'mdx' : 'md'}`;
  const plan = useMemo(() => {
    if (to === path) return { changes: [] };
    try {
      return { changes: renameNote(applyOverlay(w.base, w.overlay), path, to) };
    } catch (e) {
      return { changes: [], error: (e as Error).message };
    }
  }, [to, path, w.base, w.overlay]);

  const stage = async () => {
    // biome-ignore lint/performance/noAwaitInLoops: one at a time; each stage builds on the overlay the last one wrote
    for (const c of plan.changes) await w.stage(c.path, c.text);
    toast.success(`Staged the rename to ${to}`, {
      action: { label: 'Review', onClick: () => go(changesPage.href()) },
    });
    go(changesPage.href());
  };
  const others = plan.changes.filter((c) => c.path !== path && c.path !== to);
  return (
    <div className="v-edit v-rename">
      <PageHeader
        kind="rename"
        title={<span className="break-all font-mono text-2xl font-semibold">{path}</span>}
      />
      <div className="grid gap-2">
        <Label htmlFor={id}>New name</Label>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Input
            id={id}
            className="min-w-60 flex-1 font-mono"
            value={name}
            spellCheck={false}
            onChange={(e) => setName(e.currentTarget.value)}
          />
          {!path.includes('/') && (
            <Label className="font-mono font-normal">
              <Checkbox checked={mdx} onCheckedChange={(c) => setMdx(c === true)} />
              .mdx
            </Label>
          )}
        </div>
      </div>
      {plan.error ? (
        <div className="mt-6">
          <ErrorState>{plan.error}</ErrorState>
        </div>
      ) : (
        plan.changes.length > 0 && (
          <Section title="What changes" className="mt-8">
            <p className="m-0 text-muted-foreground">
              Moves <code className={code}>{path}</code> to <code className={code}>{to}</code>
              {others.length
                ? `, and rewrites links and references in ${others.length} file(s):`
                : '; nothing links to it.'}
            </p>
            {others.length > 0 && (
              <ul className="m-0 mt-3 list-none divide-y rounded-lg border p-0">
                {others.map((c) => (
                  <li key={c.path} className="break-all px-3 py-1.5 font-mono text-sm">
                    {c.path}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )
      )}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button onClick={stage} disabled={!plan.changes.length}>
          Stage
        </Button>
        <Button asChild={true} variant="ghost">
          <a className="text-foreground no-underline" href={link(changesPage.href())}>
            Changes
          </a>
        </Button>
      </div>
      <p className="mt-3 text-sm text-faint">
        A rename is structural: its own <code className="font-mono">vault:</code> commit
        (conventions §16).
      </p>
    </div>
  );
}

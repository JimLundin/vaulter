// Edit a file as text, frontmatter and all, and stage it; or start a new note at a path.
import { useId, useState } from 'react';
import { hrefForId } from '../../../core/paths.ts';
import { isVaultPath } from '../../../core/vault.ts';
import { today } from '../../../core/format.ts';
import { useWriter } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { Confirm } from './parts.tsx';
import { ErrorState, PageHeader } from '@/components/layout.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';

/** A new note's starting point (meta/conventions.md): the frontmatter fields, the title, See also. */
const template = (path: string) => {
  const title = path
    .replace(/\.mdx?$/, '')
    .split('/')
    .pop()!;
  return path.startsWith('daily/')
    ? `---\nwhere: []\n---\n# ${title}\n\n- \n`
    : `---\ntype: topic\naliases: []\ntags: []\ncreated: ${today()}\nsummary: ""\n---\n# ${title}\n\n\n\n## See also\n`;
};

export function Edit({ path }: { path: string }) {
  const w = useWriter();
  const original = w.base.find((f) => f.path === path)?.text;
  const staged = w.overlay?.files[path];
  const [text, setText] = useState(staged ?? original ?? template(path));
  const id = useId();
  const href = hrefForId(path.replace(/\.mdx?$/, ''));
  if (!isVaultPath(path))
    return (
      <ErrorState>
        {path} isn't a vault file: notes are at the root (.md or .mdx), or daily/, captures/, meta/
        (.md), and meta/schema.yaml.
      </ErrorState>
    );

  const save = async () => {
    await w.stage(path, text);
    location.hash = link(href);
  };
  const remove = async () => {
    await w.stage(path, null);
    location.hash = link('/changes/');
  };
  return (
    <div className="v-edit">
      <PageHeader
        kind={original === undefined ? 'new' : 'edit'}
        meta={staged !== undefined && <Badge variant="outline">staged</Badge>}
        title={<span className="break-all font-mono text-2xl font-semibold">{path}</span>}
      />
      <div className="grid gap-2">
        <Label htmlFor={id}>Text, frontmatter and all</Label>
        <Textarea
          id={id}
          className="min-h-[60vh] resize-y field-sizing-fixed font-mono text-sm leading-relaxed"
          value={text}
          spellCheck={true}
          onChange={(e) => setText(e.currentTarget.value)}
        />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={text === (staged ?? original)}>
          Stage
        </Button>
        <Button asChild={true} variant="ghost">
          <a
            className="text-foreground no-underline"
            href={link(original === undefined && staged === undefined ? '/' : href)}
          >
            Cancel
          </a>
        </Button>
        {original !== undefined && (
          <Confirm
            trigger={
              <Button variant="ghost" className="ml-auto text-destructive">
                Delete file
              </Button>
            }
            title={`Delete ${path}?`}
            description="The deletion is staged; commit it in Changes."
            action="Delete"
            destructive={true}
            onConfirm={remove}
          />
        )}
      </div>
      <p className="mt-3 text-sm text-faint">
        Staged edits show at once; commit them in{' '}
        <a className="text-primary no-underline hover:underline" href={link('/changes/')}>
          Changes
        </a>
        .
      </p>
    </div>
  );
}

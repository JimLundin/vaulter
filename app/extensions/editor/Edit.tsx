// Edit a file as text, frontmatter and all, and stage it; or start a new note at a path.
import { useState } from 'react';
import { hrefForId } from '../../../core/paths.ts';
import { isVaultPath } from '../../../core/vault.ts';
import { today } from '../../../core/format.ts';
import { useWriter } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './editor.css';

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
  const href = hrefForId(path.replace(/\.mdx?$/, ''));
  if (!isVaultPath(path))
    return (
      <p className="app-error">
        {path} isn't a vault file: notes are at the root (.md or .mdx), or daily/, captures/, meta/
        (.md), and meta/schema.yaml.
      </p>
    );

  const save = async () => {
    await w.stage(path, text);
    location.hash = link(href);
  };
  const remove = async () => {
    if (confirm(`Delete ${path}?`)) {
      await w.stage(path, null);
      location.hash = link('/changes/');
    }
  };
  return (
    <div className="v-edit">
      <div className="meta">
        <span className="chip">{original === undefined ? 'new' : 'edit'}</span>
        <code>{path}</code>
        {staged !== undefined && <span>staged</span>}
      </div>
      <textarea value={text} spellCheck={true} onChange={(e) => setText(e.currentTarget.value)} />
      <div className="bar">
        <button
          type="button"
          className="primary"
          onClick={save}
          disabled={text === (staged ?? original)}
        >
          Stage
        </button>
        <a href={link(original === undefined && staged === undefined ? '/' : href)}>Cancel</a>
        {original !== undefined && (
          <button type="button" className="danger" onClick={remove}>
            Delete file
          </button>
        )}
        <span className="hint">
          Staged edits show at once; commit them in <a href={link('/changes/')}>Changes</a>.
        </span>
      </div>
    </div>
  );
}

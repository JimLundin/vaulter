// Rename a note, or switch it between .md and .mdx: stages the move and every file whose links or
// frontmatter follow it (core/rename.ts), to review in Changes and commit as one step.
import { useMemo, useState } from 'react';
import { renameNote } from '../../../core/rename.ts';
import { applyOverlay } from '../../core/writer.ts';
import { useWriter } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './editor.css';

export function Rename({ path }: { path: string }) {
  const w = useWriter();
  const [name, setName] = useState(path.replace(/\.mdx?$/, ''));
  const [mdx, setMdx] = useState(path.endsWith('.mdx'));
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
    location.hash = link('/changes/');
  };
  const others = plan.changes.filter((c) => c.path !== path && c.path !== to);
  return (
    <div className="v-edit v-rename">
      <div className="meta">
        <span className="chip">rename</span>
        <code>{path}</code>
      </div>
      <div className="bar">
        <input value={name} spellCheck={false} onChange={(e) => setName(e.currentTarget.value)} />
        {!path.includes('/') && (
          <label>
            <input
              type="checkbox"
              checked={mdx}
              onChange={(e) => setMdx(e.currentTarget.checked)}
            />{' '}
            .mdx
          </label>
        )}
      </div>
      {plan.error ? (
        <p className="app-error">{plan.error}</p>
      ) : (
        plan.changes.length > 0 && (
          <>
            <p>
              Moves <code>{path}</code> to <code>{to}</code>
              {others.length
                ? `, and rewrites links and references in ${others.length} file(s):`
                : '; nothing links to it.'}
            </p>
            {others.length > 0 && (
              <ul>
                {others.map((c) => (
                  <li key={c.path}>
                    <code>{c.path}</code>
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      )}
      <div className="bar">
        <button type="button" className="primary" onClick={stage} disabled={!plan.changes.length}>
          Stage
        </button>
        <a href={link('/changes/')}>Changes</a>
        <span className="hint">
          A rename is structural: its own <code>vault:</code> commit (conventions §16).
        </span>
      </div>
    </div>
  );
}

// Staged edits: each file's diff, what the check says about them, and the commit.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { useEffect, useState } from 'react';
import { structuredPatch } from 'diff';
import { hrefForId } from '../../../core/paths.ts';
import { applyOverlay, newProblems } from '../../core/writer.ts';
import { CheckFailed, Conflict } from '../../core/backend.ts';
import { useWriter } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './editor.css';
import { later } from '../../core/later.ts';

function Diff({ before, after }: { before: string; after: string }) {
  const p = structuredPatch('a', 'b', before, after, '', '', { context: 2 });
  return (
    <pre className="diff">
      {p.hunks.map((h) => (
        <Fragment key={`${h.oldStart},${h.newStart}`}>
          <span className="hunk">
            @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@\n
          </span>
          {h.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a diff line is its position in the hunk; the same text can recur
            <span key={i} className={l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : ''}>
              {l}
              \n
            </span>
          ))}
        </Fragment>
      ))}
    </pre>
  );
}

export function Changes() {
  const w = useWriter();
  const staged = Object.entries(w.overlay?.files ?? {});
  const [problems, setProblems] = useState<string[] | null>(null);
  const [message, setMessage] = useState('');
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
        <h1>Changes</h1>
        {state.done ? (
          <p className="lede">
            Committed <code>{state.done.slice(0, 7)}</code>. See{' '}
            <a href={link('/history/')}>History</a>.
          </p>
        ) : (
          <p className="lede">Nothing staged. Edit a note from its page.</p>
        )}
      </div>
    );
  return (
    <div className="v-changes">
      <h1>
        Changes <span className="n">{staged.length}</span>
      </h1>
      {staged.map(([path, text]) => {
        const before = w.base.find((f) => f.path === path)?.text ?? '';
        return (
          <section key={path} className="file">
            <h2>
              <a href={link(hrefForId(path.replace(/\.mdx?$/, '')))}>{path}</a>
              <small>{text === null ? 'deleted' : before ? 'edited' : 'new'}</small>
              <a className="act" href={link(`/edit/${encodeURIComponent(path)}/`)}>
                edit
              </a>
              <button type="button" className="act" onClick={() => w.unstage(path)}>
                unstage
              </button>
            </h2>
            <Diff before={before} after={text ?? ''} />
          </section>
        );
      })}
      <section className="commit">
        {problems === null ? (
          <p className="hint">Checking…</p>
        ) : problems.length ? (
          <>
            <p className="app-error">
              The check finds {problems.length} new {problems.length === 1 ? 'problem' : 'problems'}
              :
            </p>
            <ul className="problems">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="ok">The check passes.</p>
        )}
        {w.commit ? (
          <>
            <input
              type="text"
              placeholder="Commit message"
              value={message}
              onChange={(e) => setMessage(e.currentTarget.value)}
            />
            <div className="bar">
              <button
                type="button"
                className="primary"
                disabled={state.busy || problems === null || problems.length > 0}
                onClick={commit}
              >
                {state.busy ? 'Committing…' : 'Commit to main'}
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => confirm('Discard every staged edit?') && w.discard()}
              >
                Discard all
              </button>
            </div>
          </>
        ) : (
          <p className="hint">In dev the files are the working tree: commit with git.</p>
        )}
        {!!state.error && <p className="app-error">{state.error}</p>}
      </section>
    </div>
  );
}

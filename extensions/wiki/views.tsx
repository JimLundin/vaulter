import type { Note, NotesV1 } from '@contracts/notes';
import type { Rec, RecordsV1, RecordType } from '@contracts/records';
import type { ShellV1 } from '@contracts/ui.shell';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { KINDS, type PageFields as Fields } from './page.ts';

type Page = Rec<Fields>;
interface Deps {
  records: RecordsV1;
  notes: NotesV1;
  shell: ShellV1;
  page: RecordType<Fields>;
}

const LABEL = { person: 'People', place: 'Places', event: 'Events', topic: 'Topics' };

/** What `load` gives, loaded again whenever `key` changes; undefined while loading. */
function useLoad<T>(load: () => Promise<T>, key: string) {
  const [v, setV] = useState<{ key: string; value: T }>();
  const loader = useRef(load);
  loader.current = load;
  useEffect(() => {
    let live = true;
    void loader.current().then((value) => live && setV({ key, value }));
    return () => {
      live = false;
    };
  }, [key]);
  return v?.key === key ? v.value : undefined;
}

export function PageList({ records, page }: Deps) {
  const [q, setQ] = useState('');
  const pages = useLoad(
    () => (q.trim() ? records.search([page], q) : records.query(page)) as Promise<Page[]>,
    q,
  );
  return (
    <>
      <form onSubmit={(e) => e.preventDefault()}>
        <input placeholder="Find a page" value={q} onChange={(e) => setQ(e.target.value)} />
      </form>
      <p>
        <a href="#/wiki/new">New page</a>
      </p>
      {pages?.length === 0 && <p>No pages{q ? ' match' : ' yet'}.</p>}
      {KINDS.map((k) => {
        const of = (pages ?? []).filter((p) => p.kind === k);
        if (!of.length) return null;
        return (
          <section key={k}>
            <h2>{LABEL[k]}</h2>
            <ul className="pip-list">
              {of
                .sort((a, b) => a.title.localeCompare(b.title))
                .map((p) => (
                  <li key={p.id}>
                    <a href={`#/wiki/${p.id}`}>{p.title}</a>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export function PageView({ records, notes, page, id }: Deps & { id: string }) {
  const p = useLoad(() => records.get(page, id), id);
  const sources = useLoad(
    async () => (await Promise.all((p?.sources ?? []).map((s) => notes.get(s)))).filter(Boolean),
    (p?.sources ?? []).join(),
  ) as Note[] | undefined;
  if (p === undefined) return <p>Loading…</p>;
  return (
    <article>
      <h2>{p.title}</h2>
      <small>{p.kind}</small> · <a href={`#/wiki/${p.id}/edit`}>Edit</a>
      <div className="pip-prose">{p.body || 'Nothing written yet.'}</div>
      {!!sources?.length && (
        <>
          <h3>From notes</h3>
          <ul className="pip-list">
            {sources.map((n) => (
              <li key={n.id}>
                <time dateTime={n.at}>{new Date(n.at).toLocaleDateString()}</time>
                <div className="pip-prose">{n.text}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

export function PageEdit({ records, notes, shell, page, id }: Deps & { id?: string }) {
  const existing = useLoad(
    () => (id ? records.get(page, id) : Promise.resolve(undefined)),
    id ?? '',
  );
  const recent = useLoad(() => notes.list({ limit: 30 }), 'recent');
  const [draft, setDraft] = useState<Omit<Page, 'id' | 'type' | 'created' | 'updated'>>({
    title: '',
    kind: 'topic',
    body: '',
    sources: [],
  });
  useEffect(() => {
    if (existing) setDraft(existing);
  }, [existing]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const saved = await records.put(page, { ...draft, id });
    shell.toast(id ? 'Page saved' : 'Page created');
    shell.navigate(`/wiki/${saved.id}`);
  };
  const toggle = (n: string) =>
    setDraft((d) => ({
      ...d,
      sources: d.sources.includes(n) ? d.sources.filter((s) => s !== n) : [...d.sources, n],
    }));

  if (id && existing === undefined) return <p>Loading…</p>;
  return (
    <form onSubmit={save}>
      <label>
        Title
        <input
          required={true}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <label>
        Kind
        <select
          value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as Page['kind'] })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>
      <label>
        Page
        <textarea
          value={draft.body}
          rows={10}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
      </label>
      <fieldset>
        <legend>From notes</legend>
        {(recent ?? []).map((n) => (
          <label key={n.id} style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline' }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={draft.sources.includes(n.id)}
              onChange={() => toggle(n.id)}
            />
            <span>{n.text.slice(0, 120)}</span>
          </label>
        ))}
        {recent?.length === 0 && <small>No notes yet.</small>}
      </fieldset>
      <div>
        <button type="submit">{id ? 'Save' : 'Create page'}</button>
      </div>
    </form>
  );
}

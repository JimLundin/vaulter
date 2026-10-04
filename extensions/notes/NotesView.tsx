import type { Note, NotesV1 } from '@contracts/notes';
import { type FormEvent, useEffect, useState } from 'react';

const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function NotesView({ notes, onAdded }: { notes: NotesV1; onAdded: () => void }) {
  const [list, setList] = useState<Note[] | null>(null);
  const [text, setText] = useState('');

  useEffect(() => {
    void notes.list({ limit: 200 }).then(setList);
    return notes.onAppended((n) => setList((l) => [n, ...(l ?? [])]));
  }, [notes]);

  const add = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim()) return;
    await notes.append({ text, source: 'typed' });
    setText('');
    onAdded();
  };

  return (
    <>
      <form onSubmit={add}>
        <textarea
          name="note"
          value={text}
          placeholder="What happened? (⌘↵ to add)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add();
          }}
        />
        <div>
          <button type="submit">Add note</button>
        </div>
      </form>
      {list === null ? (
        <p>Loading…</p>
      ) : list.length === 0 ? (
        <p>No notes yet.</p>
      ) : (
        <ul className="pip-list">
          {list.map((n) => (
            <li key={n.id}>
              <time dateTime={n.at}>{when(n.at)}</time>
              <div className="pip-prose">{n.text}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// Notes: the append-only log of what was said or typed, kept as records, and its page. Voice capture
// will append here too (through notes@1); the wiki reads it to build pages.
import { defineExtension } from '@pip/kernel';
import { NewNote, type Note, NoteSource, type NotesV1, notes } from '@contracts/notes';
import { records } from '@contracts/records';
import { shell } from '@contracts/ui.shell';
import { z } from 'zod';
import { NotesView } from './NotesView.tsx';

export default defineExtension({
  id: 'notes',
  version: '1.0.0',
  provides: { notes },
  requires: { records, shell },
  agentGuide: 'The log of what the person said or typed, never changed. Cite a note by its id.',
  setup({ records, shell }) {
    const note = records.registerType('note', {
      text: z.string(),
      source: NoteSource,
      at: z.iso.datetime(),
    });
    const listeners = new Set<(n: Note) => void>();
    const toNote = ({ id, text, source, at }: Note): Note => ({ id, text, source, at });

    const api: NotesV1 = {
      async append(input) {
        const n = NewNote.parse(input);
        const rec = await records.put(note, { ...n, at: n.at ?? new Date().toISOString() });
        const out = toNote(rec);
        for (const l of listeners) l(out);
        return out;
      },
      get: async (id) => {
        const rec = await records.get(note, id);
        return rec && toNote(rec);
      },
      list: async (where) => (await records.query(note, where)).map(toNote),
      onAppended(handler) {
        listeners.add(handler);
        return () => listeners.delete(handler);
      },
    };

    shell.addView({
      id: 'log',
      route: '/notes',
      title: 'Notes',
      nav: { label: 'Notes', order: 10 },
      component: () => <NotesView notes={api} onAdded={() => shell.toast('Note added')} />,
    });
    shell.addAction({
      id: 'new',
      label: 'New note',
      slot: shell.slots.primary,
      keys: 'n',
      run() {
        shell.navigate('/notes');
        requestAnimationFrame(() =>
          document.querySelector<HTMLElement>('textarea[name="note"]')?.focus(),
        );
      },
    });

    return { notes: api };
  },
});

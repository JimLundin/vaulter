// Notes: every note's page (the fallback route), what a note states about itself, the components notes
// use in MDX, the notes in search, the note commands (edit, rename, copy link) and the sidebar's Recent.
import { LinkIcon, PencilIcon, TextCursorInputIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Extension } from '../../core/extension.ts';
import type { Host } from '../../core/host.tsx';
import type { Route } from '../../core/route.ts';
import { go } from '../../core/route.ts';
import { titleOf, excerptOf, hrefOf, kind, asList, topicsOf } from '../../../core/note-fields.ts';
import { NotePage } from './NotePage.tsx';
import { OpenQuestions, FollowUps, Connections, LinkedFrom } from './sections.tsx';
import { NoteList } from './NoteList.tsx';
import { Timeline } from './Timeline.tsx';
import { Chart } from './Chart.tsx';
import { RecentSidebar } from './Recent.tsx';
import './components.css';

const onNote = (host: Host, route: Route) => host.vault.byHref.has(route.path);
const noteAt = (host: Host, route: Route) => host.vault.byHref.get(route.path)!;

export const notes: Extension = {
  id: 'notes',
  page(path, { vault }) {
    const note = vault.byHref.get(path);
    return note
      ? { title: titleOf(note), width: 'wide', body: <NotePage key={note.id} note={note} /> }
      : null;
  },
  // Edit and rename go to the editor's routes (editor/index.tsx noteActions).
  commands: () => [
    {
      id: 'note.edit',
      label: 'Edit note',
      group: 'Note',
      icon: PencilIcon,
      keys: 'e',
      when: onNote,
      run: (h, r) => go(`/edit/${encodeURIComponent(noteAt(h, r).path)}/`),
    },
    {
      id: 'note.rename',
      label: 'Rename note',
      group: 'Note',
      icon: TextCursorInputIcon,
      keys: 'r',
      when: onNote,
      run: (h, r) => go(`/rename/${encodeURIComponent(noteAt(h, r).path)}/`),
    },
    {
      id: 'note.link',
      label: 'Copy link to note',
      group: 'Note',
      icon: LinkIcon,
      when: onNote,
      run: (h, r) => {
        const title = titleOf(noteAt(h, r));
        navigator.clipboard.writeText(`${location.origin}${location.pathname}#${r.path}`).then(
          () => toast.success(`Copied the link to ${title}`),
          () => toast.error('Couldn’t copy the link'),
        );
      },
    },
  ],
  sidebar: [{ order: 20, view: RecentSidebar }],
  noteSections: [
    { order: 10, view: OpenQuestions },
    { order: 20, view: FollowUps },
    { order: 40, view: Connections },
    { order: 80, view: LinkedFrom },
  ],
  mdx: { NoteList, Timeline, Chart },
  search: (v) =>
    v.notes.map((n) => ({
      href: hrefOf(n),
      t: titleOf(n),
      e: excerptOf(n),
      a: asList(n.data.aliases),
      k: kind(n.id),
      g: kind(n.id) === 'note' ? topicsOf(n) : [],
    })),
};

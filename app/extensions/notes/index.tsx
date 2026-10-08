// Notes: every note's page (the fallback route), what a note states about itself, the components notes
// use in MDX, the notes in search, copying a note's link and the sidebar's Recent. Other features add to a
// note's page through its slots (slots.tsx).
import { LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Extension } from '../../shell/extension.ts';
import type { Host } from '../../shell/host.tsx';
import type { Route } from '../../shell/route.ts';
import { titleOf, excerptOf, hrefOf, kind, asList, topicsOf } from '../../../core/note-fields.ts';
import { NotePage } from './NotePage.tsx';
import { OpenQuestions, FollowUps, Connections, LinkedFrom } from './sections.tsx';
import { NoteList } from './NoteList.tsx';
import { Timeline } from './Timeline.tsx';
import { Chart } from './Chart.tsx';
import { RecentSidebar } from './Recent.tsx';
import { noteSections } from './slots.tsx';
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
  commands: () => [
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
  contributes: [
    noteSections.add({ order: 10, view: OpenQuestions }),
    noteSections.add({ order: 20, view: FollowUps }),
    noteSections.add({ order: 40, view: Connections }),
    noteSections.add({ order: 80, view: LinkedFrom }),
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

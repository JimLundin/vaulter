// The reader: a note's page (the fallback route), with what the note states and what connects to it (its
// sections), copying a note's link and the sidebar's Recent. Other
// features add to a note's page through its slots (slots.tsx). It reads notes and the graph.
import { LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Extension } from '../../core/extension.ts';
import type { Host } from '../../core/host.tsx';
import type { Route } from '../../core/route.ts';
import { titleOf } from '../notes/model/fields.ts';
import { notesOf } from '../notes/model/notes.ts';
import { NotePage } from './NotePage.tsx';
import { OpenQuestions, FollowUps, Connections, LinkedFrom } from './sections.tsx';
import { RecentSidebar } from './Recent.tsx';
import { noteSections } from './slots.tsx';

const noteAt = (host: Host, route: Route) => notesOf(host.files).byHref.get(route.path);

export const reader: Extension = {
  id: 'reader',
  page(path, host) {
    const note = notesOf(host.files).byHref.get(path);
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
      when: (h, r) => !!noteAt(h, r),
      run: (h, r) => {
        const title = titleOf(noteAt(h, r)!);
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
};

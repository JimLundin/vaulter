// Notes: every note's page (the fallback route), what a note states about itself, the components notes
// use in MDX, the notes in search, copying a note's link and the sidebar's Recent. Other features add to a
// note's page through its slots (slots.tsx).
import { LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Extension } from '../../core/extension.ts';
import type { Host } from '../../core/host.tsx';
import type { Route } from '../../core/route.ts';
import { titleOf, excerptOf, hrefOf, kind, asList, topicsOf } from './model/fields.ts';
import { NotePage } from './NotePage.tsx';
import { OpenQuestions, FollowUps, Connections, LinkedFrom } from './sections.tsx';
import { NoteList } from './NoteList.tsx';
import { Timeline } from './Timeline.tsx';
import { Chart } from './Chart.tsx';
import { RecentSidebar } from './Recent.tsx';
import { noteSections } from './slots.tsx';
import './components.css';
import { graphOf } from '../graph/model/graph.ts';
import { noteFiles } from './model/problems.ts';
import { schemaFor } from './model/schema.ts';

const onNote = (host: Host, route: Route) => graphOf(host.files).byHref.has(route.path);
const noteAt = (host: Host, route: Route) => graphOf(host.files).byHref.get(route.path)!;

export const notes: Extension = {
  id: 'notes',
  // The vault's files: the notes and the vocabulary. A write that adds a problem to them is refused.
  files: noteFiles,
  // Without a readable vocabulary nothing can be shown as it is meant.
  blocked: (host) => {
    const s = schemaFor(host.files);
    return s instanceof Error ? s.message : null;
  },
  page(path, host) {
    const vault = graphOf(host.files);
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
  search: ({ files }) =>
    graphOf(files).notes.map((n) => ({
      href: hrefOf(n),
      t: titleOf(n),
      e: excerptOf(n),
      a: asList(n.data.aliases),
      k: kind(n.id),
      g: kind(n.id) === 'note' ? topicsOf(n) : [],
    })),
};

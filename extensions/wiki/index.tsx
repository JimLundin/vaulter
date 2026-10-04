// The wiki: curated pages about people, places, events and topics, each citing the notes it was built
// from. Pages are written by hand for now; Pip will revise them as notes are appended (the onAppended
// hook below), proposing what it is unsure of as a question.
import { defineExtension } from '@pip/kernel';
import { notes } from '@contracts/notes';
import { records } from '@contracts/records';
import { shell } from '@contracts/ui.shell';
import { pageFields } from './page.ts';
import { PageEdit, PageList, PageView } from './views.tsx';

export default defineExtension({
  id: 'wiki',
  version: '1.0.0',
  requires: { records, notes, shell },
  agentGuide:
    'The source of truth for people, places, events and topics. Cite a note for every fact.',
  setup({ records, notes, shell }) {
    const page = records.registerType('page', pageFields);
    const deps = { records, notes, shell, page };

    notes.onAppended(() => {
      // Where Pip will revise the pages a new note touches.
    });

    shell.addView({
      id: 'index',
      route: '/wiki',
      title: 'Wiki',
      nav: { label: 'Wiki', order: 20 },
      component: () => <PageList {...deps} />,
    });
    shell.addView({
      id: 'new',
      route: '/wiki/new',
      title: 'New page',
      component: () => <PageEdit {...deps} />,
    });
    shell.addView({
      id: 'page',
      route: '/wiki/:id',
      title: 'Wiki',
      component: ({ params }) => <PageView {...deps} id={params.id} />,
    });
    shell.addView({
      id: 'edit',
      route: '/wiki/:id/edit',
      title: 'Edit page',
      component: ({ params }) => <PageEdit {...deps} id={params.id} />,
    });
  },
});

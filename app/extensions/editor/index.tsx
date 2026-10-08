// Editing: a file as text (#/edit/<path>/), a rename (#/rename/<path>/, and the agent's renameNote), the staged edits with their diffs, the check and the commit
// (#/changes/), and what the app committed, with a revert (#/history/).
import {
  HistoryIcon,
  GitCommitVerticalIcon,
  GitCompareIcon,
  PencilIcon,
  TextCursorInputIcon,
} from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { Edit } from './Edit.tsx';
import { Changes, focusCommit } from './Changes.tsx';
import { go } from '../../core/route.ts';
import { History } from './History.tsx';
import { Rename } from './Rename.tsx';
import type { Host } from '../../core/host.tsx';
import type { Route } from '../../core/route.ts';
import { noteActions } from '../notes/slots.tsx';

const onNote = (host: Host, route: Route) => host.vault.byHref.has(route.path);
const pathAt = (host: Host, route: Route) =>
  encodeURIComponent(host.vault.byHref.get(route.path)?.path ?? '');

export const editor: Extension = {
  id: 'editor',
  page(path) {
    if (path === '/changes/') return { title: 'Changes', body: <Changes /> };
    if (path === '/history/') return { title: 'History', body: <History /> };
    const m = /^\/(edit|rename)\/([^/]+)\/$/.exec(path);
    if (!m) return null;
    const file = decodeURIComponent(m[2]);
    return m[1] === 'edit'
      ? { title: `Edit ${file}`, body: <Edit key={file} path={file} />, width: 'wide' }
      : { title: `Rename ${file}`, body: <Rename key={file} path={file} /> };
  },
  nav: [
    {
      label: 'History',
      href: '/history/',
      icon: HistoryIcon,
      keys: 'g y',
      order: 80,
      summary: 'What the app committed, with a revert',
      when: (h) => !!h.writer.history,
    },
    {
      label: 'Changes',
      href: '/changes/',
      icon: GitCommitVerticalIcon,
      keys: 'g s',
      order: 90,
      badge: (h) => Object.keys(h.writer.overlay?.files ?? {}).length,
    },
  ],
  commands: () => [
    {
      id: 'note.edit',
      label: 'Edit note',
      group: 'Note',
      icon: PencilIcon,
      keys: 'e',
      when: onNote,
      run: (h, r) => go(`/edit/${pathAt(h, r)}/`),
    },
    {
      id: 'note.rename',
      label: 'Rename note',
      group: 'Note',
      icon: TextCursorInputIcon,
      keys: 'r',
      when: onNote,
      run: (h, r) => go(`/rename/${pathAt(h, r)}/`),
    },
    {
      id: 'editor.review',
      label: 'Review changes',
      group: 'Actions',
      icon: GitCompareIcon,
      when: (h) => Object.keys(h.writer.overlay?.files ?? {}).length > 0,
      run: () => go('/changes/'),
    },
    {
      id: 'editor.commit',
      label: 'Commit staged changes',
      group: 'Actions',
      icon: GitCommitVerticalIcon,
      when: (h) => !!h.writer.commit && Object.keys(h.writer.overlay?.files ?? {}).length > 0,
      run: () => {
        go('/changes/');
        focusCommit();
      },
    },
  ],
  contributes: [
    noteActions.add({ label: 'edit', href: (n) => `/edit/${encodeURIComponent(n.path)}/` }),
    noteActions.add({ label: 'rename', href: (n) => `/rename/${encodeURIComponent(n.path)}/` }),
  ],
  tools: async (ctx) => (await import('./tools.ts')).editorTools(ctx),
};

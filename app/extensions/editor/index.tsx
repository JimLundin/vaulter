// Editing: a file as text (#/edit/<path>/), a rename (#/rename/<path>/, and the agent's renameNote), the staged edits with their diffs, the check and the commit
// (#/changes/), and what the app committed, with a revert (#/history/).
import {
  HistoryIcon,
  GitCommitVerticalIcon,
  GitCompareIcon,
  PencilIcon,
  TextCursorInputIcon,
} from 'lucide-react';
import type { Extension } from '../../shell/extension.ts';
import { Edit } from './Edit.tsx';
import { Changes, focusCommit } from './Changes.tsx';
import { go } from '../../shell/route.ts';
import { History } from './History.tsx';
import { Rename } from './Rename.tsx';
import type { Host } from '../../shell/host.tsx';
import type { Route } from '../../shell/route.ts';
import { noteActions } from '../notes/slots.tsx';
import { changesPage, editPage, historyPage, renamePage } from './routes.ts';

const onNote = (host: Host, route: Route) => host.vault.byHref.has(route.path);
const fileAt = (host: Host, route: Route) => host.vault.byHref.get(route.path)?.path ?? '';

export const editor: Extension = {
  id: 'editor',
  page(path) {
    if (changesPage.match(path)) return { title: 'Changes', body: <Changes /> };
    if (historyPage.match(path)) return { title: 'History', body: <History /> };
    const edit = editPage.match(path);
    if (edit) {
      return {
        title: `Edit ${edit.file}`,
        body: <Edit key={edit.file} path={edit.file} />,
        width: 'wide',
      };
    }
    const rename = renamePage.match(path);
    return rename
      ? { title: `Rename ${rename.file}`, body: <Rename key={rename.file} path={rename.file} /> }
      : null;
  },
  nav: [
    {
      label: 'History',
      href: historyPage.href(),
      icon: HistoryIcon,
      keys: 'g y',
      order: 80,
      summary: 'What the app committed, with a revert',
      when: (h) => !!h.writer.history,
    },
    {
      label: 'Changes',
      href: changesPage.href(),
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
      run: (h, r) => go(editPage.href({ file: fileAt(h, r) })),
    },
    {
      id: 'note.rename',
      label: 'Rename note',
      group: 'Note',
      icon: TextCursorInputIcon,
      keys: 'r',
      when: onNote,
      run: (h, r) => go(renamePage.href({ file: fileAt(h, r) })),
    },
    {
      id: 'editor.review',
      label: 'Review changes',
      group: 'Actions',
      icon: GitCompareIcon,
      when: (h) => Object.keys(h.writer.overlay?.files ?? {}).length > 0,
      run: () => go(changesPage.href()),
    },
    {
      id: 'editor.commit',
      label: 'Commit staged changes',
      group: 'Actions',
      icon: GitCommitVerticalIcon,
      when: (h) => !!h.writer.commit && Object.keys(h.writer.overlay?.files ?? {}).length > 0,
      run: () => {
        go(changesPage.href());
        focusCommit();
      },
    },
  ],
  contributes: [
    noteActions.add({ label: 'edit', href: (n) => editPage.href({ file: n.path }) }),
    noteActions.add({ label: 'rename', href: (n) => renamePage.href({ file: n.path }) }),
  ],
  tools: async (ctx) => (await import('./tools.ts')).editorTools(ctx),
};

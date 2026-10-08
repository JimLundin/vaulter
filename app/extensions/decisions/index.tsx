// Decisions: every `decisions` entry with its reason (#/decisions/), and a note's own under it.
import { ScaleIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { Decisions, NoteDecisions } from './Decisions.tsx';
import { noteSections } from '../reader/slots.tsx';
import { decisionsPage } from './routes.ts';

export const decisions: Extension = {
  id: 'decisions',
  page: (path) => (decisionsPage.match(path) ? { title: 'Decisions', body: <Decisions /> } : null),
  nav: [
    {
      label: 'Decisions',
      href: decisionsPage.href(),
      icon: ScaleIcon,
      keys: 'g d',
      order: 40,
      summary: 'Every decision recorded in the vault, and why',
    },
  ],
  contributes: [noteSections.add({ order: 30, view: NoteDecisions })],
};

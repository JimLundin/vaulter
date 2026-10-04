// Decisions: every `decisions` entry with its reason (#/decisions/), and a note's own under it.
import { ScaleIcon } from 'lucide-react';
import type { Extension } from '../../core/extension.ts';
import { Decisions, NoteDecisions } from './Decisions.tsx';

export const decisions: Extension = {
  id: 'decisions',
  page: (path) => (path === '/decisions/' ? { title: 'Decisions', body: <Decisions /> } : null),
  nav: [
    {
      label: 'Decisions',
      href: '/decisions/',
      icon: ScaleIcon,
      keys: 'g d',
      order: 40,
      summary: 'Every decision recorded in the vault, and why',
    },
  ],
  noteSections: [{ order: 30, view: NoteDecisions }],
};

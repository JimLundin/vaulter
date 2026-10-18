import { definePage } from '@/core/navigation/index.ts';
import { decisionsRoute } from '@/modules/decisions/routes.ts';
import { DecisionsPage } from './DecisionsPage.tsx';
export const decisionsPage = definePage({
  patterns: [decisionsRoute],
  component: DecisionsPage,
  destination: { label: 'Decisions', href: decisionsRoute.href(), icon: 'check' },
  command: { id: 'go.decisions', keys: 'g d' },
});

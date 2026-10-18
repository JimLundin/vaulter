import { definePage } from '@/core/navigation/index.ts';
import { Wiki } from './Wiki.tsx';
import { wikiRoute, pageRoute } from '@/modules/wiki/routes.ts';
export const wikiPage = definePage({
  patterns: [wikiRoute, pageRoute],
  component: Wiki,
  destination: { label: 'Wiki', href: wikiRoute.href(), icon: 'book' },
  command: { id: 'go.wiki', keys: 'g w' },
});

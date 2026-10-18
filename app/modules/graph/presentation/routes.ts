import { definePage } from '@/core/navigation/index.ts';
import { GraphPage } from './GraphPage.tsx';
import { graphRoute, graphSubjectRoute } from '@/modules/graph/routes.ts';
export const graphPage = definePage({
  patterns: [graphRoute, graphSubjectRoute],
  component: GraphPage,
  destination: { label: 'Graph', href: graphRoute.href(), icon: 'network' },
  command: { id: 'go.graph', keys: 'g g' },
});

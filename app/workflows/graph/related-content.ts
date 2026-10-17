import type { NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import { readGraph } from './reading.ts';
import { graphSchemas } from './records.ts';

/** Graph-owned interpretation for embedded relationship records and owner-supplied collections. */
export function graphRelatedContent(view: NodeSnapshot) {
  const graph = readGraph(view);
  return {
    classifications: graph.classifications,
    relationship: (node: NodeVersion) => {
      const data = graphSchemas.relationship.parse(node.data);
      const target = node.connection && view.resolve(node.connection.target);
      return {
        ...data,
        label: String(
          target?.data?.label ??
            target?.data?.title ??
            target?.data?.key ??
            data.label ??
            'Unavailable target',
        ),
      };
    },
    query: <Candidate extends { node: string; title: string; created?: string }>(
      node: NodeVersion,
      candidates: readonly Candidate[],
    ) => graph.query(graphSchemas.query.parse(node.data), candidates),
  };
}

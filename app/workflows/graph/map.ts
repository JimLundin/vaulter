import type { JsonObject } from '../../vault/nodes/model.ts';
import type { GraphExplorerState } from './explorer.ts';

/** Application supplies record-owner projections; Graph interprets only map membership. */
export interface GraphMapReference {
  id: string;
  title: string;
  text: string;
  href?: string;
  state: 'original' | 'newer' | 'deleted';
  source: { node: string; transaction: string };
}
export interface GraphMapBlock {
  id: string;
  data: JsonObject;
  children: GraphMapBlock[];
  evidence: GraphMapReference[];
}
export interface GraphMapTopic {
  id: string;
  title: string;
  blocks: GraphMapBlock[];
  metadata: readonly { label: string }[];
}
export interface GraphPageProps {
  state: GraphExplorerState;
  topics: readonly GraphMapTopic[];
  node?: string;
  currentSourceText: (node: string) => string | undefined;
  onNavigate?: (href: string) => void;
  onRetry?: () => void;
}
export interface GraphMapRecord {
  id: string;
  label: string;
  tone: 'topic' | 'statement' | 'source' | 'question';
  group: string;
  connections: number;
  parentTopics: string[];
  topic?: string;
  block?: GraphMapBlock;
  reference?: GraphMapReference;
  href?: string;
  unavailable?: boolean;
}
export interface GraphMapEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

/** Keep shared identities, all incident counts, and every recorded relationship once. */
export function projectGraphMap(topics: readonly GraphMapTopic[], state: GraphExplorerState) {
  const records = new Map<string, GraphMapRecord>();
  const edges = new Map<string, GraphMapEdge>();
  const add = (id: string, label: string, tone: GraphMapRecord['tone'], topic?: GraphMapTopic) => {
    let record = records.get(id);
    if (!record) {
      record = {
        id,
        label,
        tone,
        group: topic?.metadata.map((term) => term.label).join(' / ') || 'Unclassified',
        connections: 0,
        parentTopics: [],
        topic: topic?.id,
      };
      records.set(id, record);
    }
    if (topic && !record.parentTopics.includes(topic.id)) record.parentTopics.push(topic.id);
    if (record.parentTopics.length > 1) record.group = 'Shared';
    return record;
  };
  const words = (block: GraphMapBlock): string =>
    typeof block.data.text === 'string' ? block.data.text : block.children.map(words).join('');
  for (const topic of topics) {
    add(topic.id, topic.title, 'topic', topic);
    const pending = [...topic.blocks];
    while (pending.length) {
      const block = pending.shift()!;
      pending.unshift(...block.children);
      if (block.data.kind !== 'paragraph' && block.data.kind !== 'question') continue;
      const record = add(
        block.id,
        words(block),
        block.data.kind === 'question' ? 'question' : 'statement',
        topic,
      );
      record.block = block;
      edges.set(`contains:${topic.id}:${block.id}`, {
        id: `contains:${topic.id}:${block.id}`,
        source: topic.id,
        target: block.id,
        label: 'contains',
      });
      for (const reference of block.evidence) {
        const source = add(reference.source.node, reference.title, 'source', topic);
        source.reference ??= reference;
        source.href ??= reference.href;
        edges.set(reference.id, {
          id: reference.id,
          source: block.id,
          target: source.id,
          label: 'cites passage',
        });
      }
    }
  }
  for (const subject of state.subjects) {
    const record = records.get(subject.id) ?? add(subject.id, subject.title, 'source');
    record.href ??= subject.href;
    record.unavailable = subject.state === 'deleted';
  }
  for (const id of records.keys()) {
    for (const relationship of state.graph?.relationships({ node: id }) ?? []) {
      const source = relationship.source.address?.node;
      const target = relationship.target.address?.node;
      if (!(source && target && records.has(source) && records.has(target))) continue;
      // Citation/containment projections keep their reviewed meaning rather than adding a second copy.
      if (!edges.has(relationship.node.key.node))
        edges.set(relationship.node.key.node, {
          id: relationship.node.key.node,
          source,
          target,
          label: relationship.label,
        });
    }
  }
  for (const edge of edges.values()) {
    records.get(edge.source)!.connections++;
    if (edge.target !== edge.source) records.get(edge.target)!.connections++;
  }
  return { records: [...records.values()], edges: [...edges.values()] };
}

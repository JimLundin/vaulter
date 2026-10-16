import type { NodeAddress, NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeSnapshot } from '../../vault/nodes/store.ts';
import { frozen } from '../../vault/nodes/json.ts';
import { graphSchemas, type QueryData, type RelationshipData, type TermData } from './records.ts';

export interface GraphEndpoint {
  readonly address?: NodeAddress;
  readonly state: 'available' | 'deleted' | 'missing' | 'unresolved';
  readonly version?: NodeVersion;
  /** Current identity state is separate from an exact endpoint's historical availability. */
  readonly current?: NodeVersion;
}
export interface GraphTerm {
  readonly node: NodeVersion;
  readonly data: TermData;
}
export interface GraphRelationship {
  readonly node: NodeVersion;
  readonly data: RelationshipData;
  readonly source: GraphEndpoint;
  readonly target: GraphEndpoint;
  readonly direction: 'outgoing' | 'incoming';
  readonly label: string;
}
export interface RelationshipSelection {
  readonly predicate?: string;
  readonly direction?: 'outgoing' | 'incoming' | 'both';
}
export interface GraphTraversal {
  readonly nodes: readonly NodeVersion[];
  readonly relationships: readonly GraphRelationship[];
}
export interface GraphClassification {
  readonly id: string;
  readonly relationship: string;
  readonly predicate: string;
  readonly scheme: string;
  readonly key: string;
  readonly label: string;
  readonly state: 'resolved' | 'unresolved' | 'deleted';
}
/** Owners supply presentation and collection membership; Graph does not interpret foreign payloads. */
export interface QueryCandidate {
  readonly node: string;
  readonly title: string;
  readonly created?: string;
}
export interface Graph {
  readonly sequence: number;
  readonly vocabulary: (scheme?: string) => readonly GraphTerm[];
  readonly classifications: (address: NodeAddress) => readonly GraphClassification[];
  readonly relationships: (
    address: NodeAddress,
    selection?: RelationshipSelection,
  ) => readonly GraphRelationship[];
  readonly traverse: (
    address: NodeAddress,
    selection?: RelationshipSelection & { readonly maxDepth?: number },
  ) => GraphTraversal;
  readonly query: <Candidate extends QueryCandidate>(
    query: QueryData,
    candidates: readonly Candidate[],
  ) => readonly Candidate[];
}

const versionKey = (node: NodeVersion) => JSON.stringify([node.key.node, node.key.transaction]);
const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);
type GraphEdge = Omit<GraphRelationship, 'direction' | 'label'>;

/** Index the live containment forest once. Exact references resolve only in the supplied snapshot. */
export function readGraph(view: NodeSnapshot): Graph {
  const terms: GraphTerm[] = [];
  const outgoing = new Map<string, GraphEdge[]>();
  const incoming = new Map<string, GraphEdge[]>();
  const endpoint = (address?: NodeAddress): GraphEndpoint => {
    if (!address) return { state: 'unresolved' };
    const version = view.resolve(address);
    return {
      address,
      state: !version ? 'missing' : version.data ? 'available' : 'deleted',
      version,
      current: view.get(address.node),
    };
  };
  const pending = [...view.roots()];
  const visited = new Set<string>();
  while (pending.length) {
    const node = pending.pop()!;
    if (!node.data || visited.has(node.key.node)) continue;
    visited.add(node.key.node);
    pending.push(...view.children(node.key.node));
    if (node.data.kind === 'term')
      terms.push(frozen({ node, data: graphSchemas.term.parse(node.data) }));
    if (node.data.kind !== 'relationship') continue;
    const edge = frozen({
      node,
      data: graphSchemas.relationship.parse(node.data),
      source: endpoint(
        node.connection?.source ?? (node.placement && { node: node.placement.parent }) ?? undefined,
      ),
      target: endpoint(node.connection?.target),
    });
    for (const [index, address] of [
      [outgoing, edge.source.address],
      [incoming, edge.target.address],
    ] as const) {
      if (!address) continue;
      const entries = index.get(address.node) ?? [];
      entries.push(edge);
      index.set(address.node, entries);
    }
  }
  terms.sort(
    (a, b) =>
      compare(a.data.scheme, b.data.scheme) ||
      compare(a.data.key, b.data.key) ||
      compare(a.node.key.node, b.node.key.node),
  );
  const predicates = new Map<string, GraphTerm[]>();
  for (const term of terms) {
    if (term.data.scheme !== 'predicate') continue;
    const entries = predicates.get(term.data.key) ?? [];
    entries.push(term);
    predicates.set(term.data.key, entries);
  }
  const matches = (address: NodeAddress, selected: GraphEndpoint) => {
    if (selected.address?.node !== address.node) return false;
    if (!address.transaction) return true;
    return selected.version?.key.transaction === address.transaction;
  };
  const relationships: Graph['relationships'] = (address, selection = {}) => {
    const result: GraphRelationship[] = [];
    const seen = new Set<string>();
    for (const [direction, index, side] of [
      ['outgoing', outgoing, 'source'],
      ['incoming', incoming, 'target'],
    ] as const) {
      if (
        selection.direction &&
        selection.direction !== 'both' &&
        selection.direction !== direction
      )
        continue;
      for (const edge of index.get(address.node) ?? []) {
        if (
          seen.has(edge.node.key.node) ||
          (selection.predicate && edge.data.predicate !== selection.predicate) ||
          !matches(address, edge[side])
        )
          continue;
        seen.add(edge.node.key.node);
        const definitions = predicates.get(edge.data.predicate);
        // Ambiguous imported vocabulary stays inspectable without choosing an arbitrary definition.
        const term = definitions?.length === 1 ? definitions[0].data : undefined;
        const label =
          direction === 'outgoing' || term?.symmetric
            ? (term?.label ?? edge.data.predicate)
            : (term?.inverse ?? edge.data.predicate);
        result.push({ ...edge, direction, label });
      }
    }
    return result.sort((a, b) => compare(a.node.key.node, b.node.key.node));
  };
  const traverse: Graph['traverse'] = (address, selection = {}) => {
    const maxDepth = selection.maxDepth ?? Number.POSITIVE_INFINITY;
    if (maxDepth !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(maxDepth) || maxDepth < 0))
      throw new Error('Graph traversal depth must be a nonnegative safe integer.');
    const root = view.resolve(address);
    if (!root?.data) return { nodes: [], relationships: [] };
    const nodes: NodeVersion[] = [];
    const found = new Map<string, GraphRelationship>();
    const seen = new Set<string>([versionKey(root)]);
    const queue = [{ node: root, depth: 0 }];
    for (const { node, depth } of queue) {
      nodes.push(node);
      if (depth >= maxDepth) continue;
      for (const edge of relationships(node.key, selection)) {
        if (!found.has(edge.node.key.node)) found.set(edge.node.key.node, edge);
        const next = edge.direction === 'outgoing' ? edge.target : edge.source;
        if (next.state !== 'available' || !next.version) continue;
        const key = versionKey(next.version);
        if (seen.has(key)) continue;
        seen.add(key);
        queue.push({ node: next.version, depth: depth + 1 });
      }
    }
    return { nodes, relationships: [...found.values()] };
  };
  const classifications: Graph['classifications'] = (address) =>
    relationships(address, { direction: 'outgoing' })
      .filter((edge) => edge.data.predicate === 'type' || edge.data.predicate === 'tag')
      .map((edge) => {
        const term =
          edge.target.state === 'available' && edge.target.version?.data?.kind === 'term'
            ? graphSchemas.term.parse(edge.target.version.data)
            : undefined;
        return {
          id: edge.target.address?.node ?? edge.node.key.node,
          relationship: edge.node.key.node,
          predicate: edge.data.predicate,
          scheme: term?.scheme ?? 'unresolved',
          key: term?.key ?? (edge.target.state === 'unresolved' ? (edge.data.label ?? '') : ''),
          label: term?.label ?? term?.key ?? edge.data.label ?? 'Unavailable term',
          state: edge.target.state === 'unresolved' ? 'unresolved' : term ? 'resolved' : 'deleted',
        };
      });
  const query: Graph['query'] = (input, candidates) => {
    const data = graphSchemas.query.parse(input);
    const classified = (node: string, predicate: string, key: string) =>
      classifications(view.get(node)!.key).some(
        (term) => term.predicate === predicate && term.state !== 'deleted' && term.key === key,
      );
    const included = new Set<string>();
    return candidates
      .filter((candidate) => {
        if (
          included.has(candidate.node) ||
          !view.get(candidate.node)?.data ||
          (data.type && !classified(candidate.node, 'type', data.type)) ||
          (data.tag && !classified(candidate.node, 'tag', data.tag))
        )
          return false;
        included.add(candidate.node);
        return true;
      })
      .sort(
        (a, b) =>
          compare(
            data.sort === 'created' ? (a.created ?? '') : a.title,
            data.sort === 'created' ? (b.created ?? '') : b.title,
          ) || compare(a.node, b.node),
      );
  };
  return {
    sequence: view.sequence,
    vocabulary: (scheme) =>
      terms.filter((term) => scheme === undefined || term.data.scheme === scheme),
    relationships,
    classifications,
    traverse,
    query,
  };
}

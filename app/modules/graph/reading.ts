import type {
  DomainDatabase,
  HistoricalReference,
  RetainedStateReference,
  TransactionRef,
} from '@/core/store/index.ts';
import { graphSchemas, type QueryData } from './query.ts';
import type { graphEntities } from './records.ts';

export type GraphDatabase = DomainDatabase<typeof graphEntities>;
export interface GraphAddress {
  readonly entity: string;
  readonly transaction?: string;
}
export interface GraphEndpoint {
  readonly address?: HistoricalReference | RetainedStateReference;
  readonly state: 'available' | 'deleted' | 'missing' | 'unresolved';
  readonly values?: Readonly<Record<string, unknown>>;
  readonly current?: Readonly<Record<string, unknown>>;
}
export interface GraphTerm {
  readonly id: string;
  readonly address: HistoricalReference;
  readonly data: {
    readonly scheme: string;
    readonly key: string;
    readonly label?: string;
    readonly use?: string;
    readonly inverse?: string;
    readonly symmetric?: boolean;
  };
}
export interface GraphRelationship {
  readonly id: string;
  readonly data: { readonly predicate: string; readonly label?: string };
  readonly source: GraphEndpoint;
  readonly target: GraphEndpoint;
  readonly direction: 'outgoing' | 'incoming';
  readonly label: string;
}
export interface GraphRelationshipCandidate {
  readonly id: string;
  readonly address: HistoricalReference;
  readonly predicate?: string;
  readonly label?: string;
  readonly source: GraphEndpoint;
  readonly target: GraphEndpoint;
  readonly direction: 'directed' | 'unknown';
  readonly reason: string;
  readonly missing: readonly ('predicate' | 'source' | 'target' | 'direction')[];
  readonly provenance?: GraphEndpoint;
}
export interface RelationshipSelection {
  readonly predicate?: string;
  readonly direction?: 'outgoing' | 'incoming' | 'both';
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
export interface QueryCandidate {
  readonly available?: boolean;
  readonly entity: string;
  readonly title: string;
  readonly created?: string;
}
export interface Graph {
  readonly candidates: readonly GraphRelationshipCandidate[];
  readonly sequence: number;
  readonly endpoints: readonly GraphEndpoint[];
  readonly vocabulary: (scheme?: string) => readonly GraphTerm[];
  readonly classifications: (address: GraphAddress) => readonly GraphClassification[];
  readonly relationships: (
    address: GraphAddress,
    selection?: RelationshipSelection,
  ) => readonly GraphRelationship[];
  readonly traverse: (
    address: GraphAddress,
    selection?: RelationshipSelection & { readonly maxDepth?: number },
  ) => {
    readonly entities: readonly GraphEndpoint[];
    readonly relationships: readonly GraphRelationship[];
  };
  readonly query: <Candidate extends QueryCandidate>(
    query: QueryData,
    candidates: readonly Candidate[],
  ) => readonly Candidate[];
}
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Pin every projection to one accepted snapshot; historical endpoints survive later deletion. */
export async function readGraph(db: GraphDatabase, snapshot?: TransactionRef): Promise<Graph> {
  const latest =
    snapshot ??
    (await db.history.transactions.first({
      select: { sequence: true },
      orderBy: [{ sequence: 'desc' }],
    }));
  const view = latest ? db.at(latest) : db;
  const selectedTransaction = latest
    ? await db.history.transactions.get(latest, { select: { sequence: true } })
    : undefined;
  const [retainedRecords, vocabulary] = await Promise.all([
    view.entities.graphRelationships.query({
      limit: null, // Graph interpretation needs complete vocabulary and relationship endpoints.
      where: { available: { eq: true } },
      select: {
        key: true,
        predicate: true,
        source: true,
        target: true,
        sourceState: true,
        targetState: true,
        label: true,
        status: true,
        direction: true,
        clarificationReason: true,
        provenance: true,
        provenanceState: true,
      },
    }),
    view.entities.graphTerms.query({
      limit: null, // Graph interpretation needs complete vocabulary and relationship endpoints.
      where: { available: { eq: true } },
      select: {
        key: true,
        scheme: true,
        label: true,
        use: true,
        inverse: true,
        symmetric: true,
      },
    }),
  ]);
  const records = retainedRecords.map((record) => {
    for (const key of ['source', 'target', 'provenance'] as const)
      if (record[key] && record[`${key}State`])
        throw new Error(`Relationship ${key} selects two states`);
    return {
      ...record,
      source: record.source ?? record.sourceState,
      target: record.target ?? record.targetState,
      provenance: record.provenance ?? record.provenanceState,
    };
  });
  const endpoints = new Map<string, GraphEndpoint>();
  const endpoint = async (
    address?: HistoricalReference | RetainedStateReference,
  ): Promise<GraphEndpoint> => {
    if (!address) return { state: 'unresolved' };
    const key = JSON.stringify([address.entity, address.transaction]);
    const cached = endpoints.get(key);
    if (cached) return cached;
    const resolved =
      address.format === 'vaulter-eav-retained-state-v1'
        ? await db.history.resolveRetainedState(address)
        : await db.history.resolve(address);
    const recorded = await db.history.inspect(resolved.transaction, resolved.entity);
    const current = latest ? await db.history.inspect(latest, resolved.entity) : undefined;
    const result: GraphEndpoint = {
      address,
      values: recorded?.values,
      current: current?.values,
      state:
        'state' in resolved && resolved.state === 'deleted'
          ? 'deleted'
          : !recorded
            ? 'missing'
            : recorded.values.available === false
              ? 'deleted'
              : 'available',
    };
    endpoints.set(key, result);
    return result;
  };
  const terms: GraphTerm[] = await Promise.all(
    vocabulary.map(async (data) => {
      const address = await db.history.reference(latest!, data);
      await endpoint(address);
      return { id: address.entity, address, data };
    }),
  );
  terms.sort(
    (a, b) =>
      compare(a.data.scheme, b.data.scheme) ||
      compare(a.data.key, b.data.key) ||
      compare(a.id, b.id),
  );
  const candidateRecords = records.filter(
    (record) =>
      record.status === 'candidate' ||
      record.direction === 'unknown' ||
      !record.source ||
      !record.target ||
      !record.predicate,
  );
  const candidates: GraphRelationshipCandidate[] = await Promise.all(
    candidateRecords.map(async (record) => ({
      id: record.key,
      address: await db.history.reference(latest!, record),
      predicate: record.predicate,
      label: record.label,
      source: await endpoint(record.source),
      target: await endpoint(record.target),
      direction: record.direction ?? 'directed',
      reason: record.clarificationReason ?? 'Target identity requires clarification',
      missing: [
        ...(!record.predicate ? ['predicate' as const] : []),
        ...(!record.source ? ['source' as const] : []),
        ...(!record.target ? ['target' as const] : []),
        ...(record.direction === 'unknown' ? ['direction' as const] : []),
      ],
      provenance: record.provenance ? await endpoint(record.provenance) : undefined,
    })),
  );
  candidates.sort((a, b) => compare(a.id, b.id));
  const edges = await Promise.all(
    records
      .filter(
        (record) =>
          record.status !== 'candidate' &&
          record.direction !== 'unknown' &&
          record.source &&
          record.target &&
          record.predicate,
      )
      .map(async (record) => ({
        id: record.key,
        data: { ...record, predicate: record.predicate! },
        source: await endpoint(record.source),
        target: await endpoint(record.target),
      })),
  );
  const outgoing = new Map<string, typeof edges>();
  const incoming = new Map<string, typeof edges>();
  for (const edge of edges)
    for (const [index, address] of [
      [outgoing, edge.source.address],
      [incoming, edge.target.address],
    ] as const) {
      if (!address) continue;
      const entries = index.get(address.entity) ?? [];
      entries.push(edge);
      index.set(address.entity, entries);
    }
  const matches = (address: GraphAddress, selected: GraphEndpoint) =>
    address.entity === selected.address?.entity &&
    (!address.transaction || address.transaction === selected.address.transaction);
  const relationships: Graph['relationships'] = (address, selection = {}) => {
    const found = new Map<string, GraphRelationship>();
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
      for (const edge of index.get(address.entity) ?? []) {
        if (
          found.has(edge.id) ||
          !matches(address, edge[side]) ||
          (selection.predicate && selection.predicate !== edge.data.predicate)
        )
          continue;
        const definitions = terms.filter(
          (term) => term.data.scheme === 'predicate' && term.data.key === edge.data.predicate,
        );
        const term = definitions.length === 1 ? definitions[0]!.data : undefined;
        found.set(edge.id, {
          ...edge,
          direction,
          label:
            direction === 'outgoing' || term?.symmetric
              ? (term?.label ?? edge.data.predicate)
              : (term?.inverse ?? edge.data.predicate),
        });
      }
    }
    return [...found.values()].sort((a, b) => compare(a.id, b.id));
  };
  const classifications: Graph['classifications'] = (address) =>
    relationships(address, { direction: 'outgoing' })
      .filter((edge) => ['type', 'tag'].includes(edge.data.predicate))
      .map((edge) => {
        const term = edge.target.values;
        const resolved =
          edge.target.state === 'available' && edge.target.address?.type === 'graph.term';
        return {
          id: edge.target.address?.entity ?? edge.id,
          relationship: edge.id,
          predicate: edge.data.predicate,
          scheme: resolved ? String(term?.scheme) : 'unresolved',
          key: resolved
            ? String(term?.key)
            : edge.target.state === 'unresolved'
              ? (edge.data.label ?? '')
              : '',
          label: resolved
            ? String(term?.label ?? term?.key)
            : (edge.data.label ?? 'Unavailable term'),
          state:
            edge.target.state === 'unresolved' ? 'unresolved' : resolved ? 'resolved' : 'deleted',
        };
      });
  return {
    candidates,
    sequence: selectedTransaction?.sequence ?? 0,
    endpoints: [...endpoints.values()],
    vocabulary: (scheme) => terms.filter((term) => !scheme || term.data.scheme === scheme),
    relationships,
    classifications,
    traverse: (address, selection = {}) => {
      const depth = selection.maxDepth ?? Number.POSITIVE_INFINITY;
      if (depth !== Number.POSITIVE_INFINITY && (!Number.isSafeInteger(depth) || depth < 0))
        throw new Error('Graph traversal depth must be a nonnegative safe integer.');
      const root = [...endpoints.values()].find((value) => matches(address, value));
      if (root?.state !== 'available') return { entities: [], relationships: [] };
      const seen = new Set<string>();
      const found = new Map<string, GraphRelationship>();
      const queue = [{ value: root, depth: 0 }];
      const entities: GraphEndpoint[] = [];
      for (const item of queue) {
        const key = JSON.stringify([item.value.address?.entity, item.value.address?.transaction]);
        if (seen.has(key)) continue;
        seen.add(key);
        entities.push(item.value);
        if (item.depth >= depth) continue;
        for (const edge of relationships(item.value.address!, selection)) {
          found.set(edge.id, edge);
          const next = edge.direction === 'outgoing' ? edge.target : edge.source;
          if (next.state === 'available') queue.push({ value: next, depth: item.depth + 1 });
        }
      }
      return { entities, relationships: [...found.values()] };
    },
    query: (input, candidates) => {
      const data = graphSchemas.query.parse(input);
      const seen = new Set<string>();
      return candidates
        .filter((candidate) => {
          const endpoint = [...endpoints.values()].find(
            (value) => value.address?.entity === candidate.entity,
          );
          if (
            seen.has(candidate.entity) ||
            candidate.available === false ||
            (endpoint && (!endpoint.current || endpoint.current.available === false))
          )
            return false;
          const terms = classifications(candidate);
          if (
            data.type &&
            !terms.some(
              (term) =>
                term.predicate === 'type' && term.state !== 'deleted' && term.key === data.type,
            )
          )
            return false;
          if (
            data.tag &&
            !terms.some(
              (term) =>
                term.predicate === 'tag' && term.state !== 'deleted' && term.key === data.tag,
            )
          )
            return false;
          seen.add(candidate.entity);
          return true;
        })
        .sort(
          (a, b) =>
            compare(
              data.sort === 'created' ? (a.created ?? '') : a.title,
              data.sort === 'created' ? (b.created ?? '') : b.title,
            ) || compare(a.entity, b.entity),
        );
    },
  };
}

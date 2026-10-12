import type { NodeAddress, NodeVersion, Transaction } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeStore } from '../../vault/nodes/store.ts';
import { parseQuestion, type QuestionData } from './records.ts';

export interface QuestionTarget {
  readonly relationship?: string;
  /** Unresolved relationships retain their label without inventing a target identity. */
  readonly address?: NodeAddress;
  /** The addressed node version. Child prose needs a separately retained snapshot selection. */
  readonly version?: NodeVersion;
  readonly state: 'available' | 'newer' | 'deleted' | 'missing' | 'unresolved';
  /** What an unresolved relationship named; it is never treated as an answer. */
  readonly label?: string;
}
export interface QuestionAttribution {
  readonly transaction: string;
  readonly at: string;
  readonly author: NodeAddress;
  readonly origin: NodeAddress | null;
}
export interface Question {
  readonly id: string;
  readonly key: Required<NodeAddress>;
  readonly data: QuestionData;
  readonly status: 'open' | 'answered' | 'abandoned';
  /** Primary subject follows existing placement; additional subjects use about relationships. */
  readonly subject?: QuestionTarget;
  readonly subjects: readonly QuestionTarget[];
  readonly answers: readonly QuestionTarget[];
  readonly created?: QuestionAttribution;
  readonly updated?: QuestionAttribution;
}

function target(
  address: NodeAddress,
  view: NodeSnapshot,
  relationship?: NodeVersion,
): QuestionTarget {
  const version = view.resolve(address);
  const current = view.get(address.node);
  const state = !(version && current)
    ? 'missing'
    : !(version.data && current.data)
      ? 'deleted'
      : address.transaction && current.key.transaction !== version.key.transaction
        ? 'newer'
        : 'available';
  return {
    address,
    version,
    state,
    ...(relationship ? { relationship: relationship.key.node } : {}),
  };
}

/** Interpret one canonical question using supplied relationships, independently of their placement. */
export function readQuestion(
  node: NodeVersion,
  view: NodeSnapshot,
  relationships: readonly NodeVersion[] = view.children(node.key.node),
): Question | undefined {
  if (node.data?.kind !== 'question') return;
  const data = parseQuestion(node.data);
  const subject = node.placement ? target({ node: node.placement.parent }, view) : undefined;
  const subjects: QuestionTarget[] = subject ? [subject] : [];
  const answers: QuestionTarget[] = [];
  for (const relationship of relationships) {
    if (relationship.data?.kind !== 'relationship') continue;
    const { connection } = relationship;
    if (connection && connection.source.node !== node.key.node) continue;
    if (!connection && relationship.placement?.parent !== node.key.node) continue;
    const { predicate } = relationship.data;
    if (predicate !== 'about' && predicate !== 'answered-by') continue;
    const related = connection
      ? target(connection.target, view, relationship)
      : {
          relationship: relationship.key.node,
          state: 'unresolved' as const,
          ...(typeof relationship.data.label === 'string'
            ? { label: relationship.data.label }
            : {}),
        };
    if (predicate === 'answered-by') answers.push(related);
    else {
      const duplicate = subjects.some(
        (entry) => entry.address && related.address && sameAddress(entry.address, related.address),
      );
      if (!duplicate) subjects.push(related);
    }
  }
  // A recorded answer connection survives later target deletion or unavailable content.
  const answered = answers.some((answer) => answer.state !== 'unresolved');
  return {
    id: node.key.node,
    key: node.key,
    data,
    status: answered ? 'answered' : data.abandoned ? 'abandoned' : 'open',
    subject,
    subjects,
    answers,
  };
}

function sameAddress(first: NodeAddress, second: NodeAddress): boolean {
  return first.node === second.node && first.transaction === second.transaction;
}

function attribution(transaction: Transaction): QuestionAttribution {
  return {
    transaction: transaction.id,
    at: transaction.recordedAt,
    author: { node: transaction.recordedBy },
    origin: transaction.origin ? { node: transaction.origin } : null,
  };
}

/** List retained questions, including questions whose subject is no longer reachable from a root. */
export async function readQuestions(
  nodes: NodeStore,
  selectedView?: NodeSnapshot,
): Promise<Question[]> {
  const view = selectedView ?? (await nodes.snapshot());
  const transactions = new Map<string, Transaction>();
  const identities = new Set<string>();
  const created = new Map<string, Transaction>();
  let beforeSequence = view.sequence + 1;
  for (;;) {
    // biome-ignore lint/performance/noAwaitInLoops: the next cursor depends on this batch.
    const batch = await nodes.history({ beforeSequence, limit: 200 });
    const changes = await Promise.all(batch.map((transaction) => nodes.changes(transaction.id)));
    for (const [index, transaction] of batch.entries()) {
      transactions.set(transaction.id, transaction);
      for (const difference of changes[index]) {
        if (difference.after.data?.kind === 'question') {
          identities.add(difference.node);
          const earlier = created.get(difference.node);
          if (!earlier || transaction.sequence < earlier.sequence)
            created.set(difference.node, transaction);
        } else if (difference.after.data?.kind === 'relationship') identities.add(difference.node);
      }
    }
    if (batch.length < 200) break;
    beforeSequence = Math.min(...batch.map((transaction) => transaction.sequence));
  }
  const selected = [...identities].flatMap((id) => {
    const node = view.get(id);
    return node?.data ? [node] : [];
  });
  const relations = new Map<string, NodeVersion[]>();
  for (const node of selected) {
    if (node.data?.kind !== 'relationship') continue;
    const source = node.connection?.source.node ?? node.placement?.parent;
    if (!source) continue;
    const relationships = relations.get(source) ?? [];
    relationships.push(node);
    relations.set(source, relationships);
  }
  return selected.flatMap((node) => {
    const question = readQuestion(node, view, relations.get(node.key.node) ?? []);
    if (!question) return [];
    const first = created.get(node.key.node);
    const latest = transactions.get(node.key.transaction);
    return [
      {
        ...question,
        ...(first ? { created: attribution(first) } : {}),
        ...(latest ? { updated: attribution(latest) } : {}),
      },
    ];
  });
}

export interface QuestionsReadingState {
  readonly questions: readonly Question[] | null;
  readonly view?: NodeSnapshot;
  readonly loading: boolean;
  readonly error?: string;
}
export interface QuestionsReading {
  readonly start: () => void;
  readonly reload: () => Promise<void>;
  readonly snapshot: () => QuestionsReadingState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly closed: () => boolean;
  readonly dispose: () => void;
}

/** Own the shared collection and its subscription; callers supply the store lifetime. */
export function createQuestionsReading(nodes: NodeStore | null): QuestionsReading {
  let state: QuestionsReadingState = { questions: null, loading: !!nodes };
  let generation = 0;
  let disposed = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: QuestionsReadingState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const reload = async () => {
    if (disposed || !nodes) return;
    const request = ++generation;
    publish({ ...state, loading: true, error: undefined });
    try {
      const view = await nodes.snapshot();
      const questions = await readQuestions(nodes, view);
      if (!disposed && request === generation) publish({ questions, view, loading: false });
    } catch (error) {
      if (!disposed && request === generation)
        publish({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  const load = () => {
    reload().catch((error: unknown) => {
      if (!disposed)
        publish({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    });
  };
  return {
    start: () => {
      if (disposed || started) return;
      started = true;
      if (nodes) unsubscribe = nodes.subscribe(load);
      load();
    },
    reload,
    snapshot: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe?.();
      listeners.clear();
    },
  };
}

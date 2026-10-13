import { z } from 'zod';
import { NodePublicationRejected } from '../../vault/nodes/history.ts';
import { canonical, compare, frozen } from '../../vault/nodes/json.ts';
import type { NodeAddress, NodeVersion } from '../../vault/nodes/model.ts';
import type {
  NodeCommit,
  NodePublicationContext,
  NodePublicationRule,
  NodeSnapshot,
  NodeStore,
} from '../../vault/nodes/store.ts';
import { prepareAnswerQuestion, prepareAskQuestion, type QuestionCommit } from './operations.ts';
import { readQuestions } from './reading.ts';
import { answerSuggestions } from './records.ts';

/** Product supplies foreign text ownership and distinguishes Wiki knowledge from source material. */
export interface QuestionContextReading {
  /** Exact containers do not freeze their child prose; only self-contained text is eligible. */
  readonly text: (node: NodeVersion, view: NodeSnapshot) => string | undefined;
  readonly isKnowledge: (node: NodeVersion, view: NodeSnapshot) => boolean;
  readonly title: (node: NodeVersion, view: NodeSnapshot) => string;
}

const exactAddress = z.strictObject({ node: z.string().min(1), transaction: z.string().min(1) });
export const askQuestionInput = z.object({
  text: z.string().trim().min(1),
  subject: z.string().min(1).optional(),
  suggestions: answerSuggestions,
  source: exactAddress,
  /** Empty when no relevant knowledge exists; never invent grounding to fill it. */
  knowledge: z.array(exactAddress).max(6),
});
export type AskQuestionInput = z.infer<typeof askQuestionInput>;

export interface AnswerQuestionInput {
  readonly question: Required<NodeAddress>;
  readonly text: string;
}

/** Trusted producer identity, supplied by Product or an accepted Agent invocation. */
export interface QuestionWriter {
  readonly kind: 'agent' | 'person';
  readonly recordedBy: string;
  readonly origin: string | null;
}

export interface QuestionActions {
  readonly ask: (
    view: NodeSnapshot,
    input: AskQuestionInput,
    writer: QuestionWriter,
  ) => QuestionCommit;
  readonly answer: (
    view: NodeSnapshot,
    input: AnswerQuestionInput,
    writer: QuestionWriter,
  ) => Promise<QuestionCommit>;
}

export interface QuestionOwnership extends QuestionActions {
  readonly publication: NodePublicationRule;
}

interface IssuedQuestionWork {
  readonly anchor: Required<NodeAddress>;
  readonly changes: string;
  readonly expectedReads: Readonly<Record<string, string | null>>;
  readonly recordedBy: string;
  readonly origin: string | null;
  readonly undoOf: null;
  finalized?: string;
}

const changeContents = (changes: NodeCommit['changes']) =>
  canonical([...changes].sort((first, second) => compare(first.node, second.node)));

/** Owner-supplied text admission may depend on foreign ancestry; retain those reads with the action. */
function actionSnapshot(view: NodeSnapshot, reads: Record<string, string | null>): NodeSnapshot {
  const track = (node: string) => {
    reads[node] = view.get(node)?.key.transaction ?? null;
  };
  return {
    sequence: view.sequence,
    get: (node) => {
      track(node);
      return view.get(node);
    },
    resolve: (address) => {
      track(address.node);
      return view.resolve(address);
    },
    children: (parent) => {
      track(typeof parent === 'string' ? parent : parent.node);
      const children = view.children(parent);
      for (const child of children) track(child.key.node);
      return children;
    },
    roots: () => {
      const roots = view.roots();
      for (const root of roots) track(root.key.node);
      return roots;
    },
  };
}

/** Retained ownership follows identity, even after a deletion, move, or payload retag. */
function questionChanges(context: NodePublicationContext): NodeCommit['changes'] {
  const retained = new Map<string, readonly NodeVersion[]>();
  const owned = new Set<string>();
  const versions = (node: string) => {
    let values = retained.get(node);
    if (!values) {
      const proposed = context.after.get(node);
      values = [
        ...context.versions(node),
        ...(proposed?.key.transaction === context.request.id ? [proposed] : []),
      ];
      retained.set(node, values);
    }
    return values;
  };
  const belongs = (node: string, visiting = new Set<string>()): boolean => {
    if (owned.has(node)) return true;
    if (visiting.has(node)) return false;
    visiting.add(node);
    for (const version of versions(node)) {
      if (
        ['question', 'answer'].includes(String(version.data?.kind)) ||
        (version.placement && belongs(version.placement.parent, visiting)) ||
        (version.data?.kind === 'relationship' &&
          version.connection &&
          belongs(version.connection.source.node, visiting))
      ) {
        owned.add(node);
        return true;
      }
    }
    return false;
  };
  return context.request.changes.filter((change) => belongs(change.node));
}

/**
 * Questions owns live write construction and its publication permission. Product composes this
 * lifetime with the enforcing node interface; callers can request actions, never bless raw work.
 */
export function createQuestionOwnership(options: {
  readonly nodes: NodeStore;
  readonly reading?: QuestionContextReading;
}): QuestionOwnership {
  const issued = new Map<string, IssuedQuestionWork>();
  const remember = (request: QuestionCommit, writer: QuestionWriter) => {
    issued.set(request.id, {
      anchor: { node: request.changes[0].node, transaction: request.id },
      changes: changeContents(request.changes),
      expectedReads: frozen(structuredClone(request.expectedReads ?? {})),
      recordedBy: writer.recordedBy,
      origin: writer.origin,
      undoOf: null,
    });
    return request;
  };
  const publication: NodePublicationRule = (context) => {
    // Accepted retries are resolved by persistence before this rule runs. Keep uncertain requests,
    // but release successful action permissions after authoritative history contains their work.
    for (const [id, work] of issued) if (context.before.resolve(work.anchor)) issued.delete(id);
    const { request } = context;
    const work = issued.get(request.id);
    const changes = questionChanges(context);
    if (!(work || changes.length)) return;
    const reject = () => {
      throw new NodePublicationRejected(
        'Questions changes must be produced by the Questions create or answer action.',
      );
    };
    if (
      !work ||
      work.changes !== changeContents(changes) ||
      work.recordedBy !== request.recordedBy ||
      work.origin !== request.origin ||
      work.undoOf !== request.undoOf
    )
      return reject();
    for (const [node, transaction] of Object.entries(work.expectedReads))
      if (request.expectedReads?.[node] !== transaction) return reject();
    // Agent may add tracked reads and other owners may add changes before initial admission.
    // Once publication is entered, retries retain the exact complete request and identities.
    const finalized = canonical(request);
    if (work.finalized !== undefined && work.finalized !== finalized) return reject();
    work.finalized = finalized;
  };
  const passage = (view: NodeSnapshot, address: Required<NodeAddress>, knowledge: boolean) => {
    const { reading } = options;
    if (!reading) throw new Error('Question source reading is unavailable.');
    const version = view.resolve(address);
    if (!version?.data || view.get(address.node)?.key.transaction !== address.transaction)
      throw new Error('Question context has changed or is unavailable; read it again.');
    if (!reading.text(version, view)?.trim())
      throw new Error('Question context requires a self-contained text version.');
    if (reading.isKnowledge(version, view) !== knowledge)
      throw new Error(
        knowledge
          ? 'Existing knowledge must be Wiki text.'
          : 'The Question source must be retained source material.',
      );
  };
  return {
    publication,
    ask: (view, input, writer) => {
      if (writer.kind !== 'agent') throw new Error('Questions are created by an Agent action.');
      const prepared = askQuestionInput.parse(input);
      const expectedReads: Record<string, string | null> = {};
      const selected = actionSnapshot(view, expectedReads);
      passage(selected, prepared.source, false);
      for (const knowledge of prepared.knowledge) passage(selected, knowledge, true);
      const request = prepareAskQuestion(selected, {
        ...prepared,
        id: crypto.randomUUID(),
        node: crypto.randomUUID(),
      });
      return remember(
        frozen({ ...request, expectedReads: { ...request.expectedReads, ...expectedReads } }),
        writer,
      );
    },
    answer: async (view, input, writer) => {
      if (writer.kind !== 'person') throw new Error('Only a person can record a direct Answer.');
      const current = (await readQuestions(options.nodes, view)).find(
        (question) => question.id === input.question.node,
      );
      if (current?.status !== 'open')
        throw new Error('This question is no longer open. Review its current status.');
      return remember(
        prepareAnswerQuestion(view, {
          id: crypto.randomUUID(),
          node: crypto.randomUUID(),
          relationship: crypto.randomUUID(),
          question: input.question,
          text: input.text,
          relationships: [
            ...current.subjects,
            ...current.answers,
            ...(current.sources ?? []),
            ...(current.knowledge ?? []),
          ].flatMap((target) => {
            const relationship = target.relationship && view.get(target.relationship);
            return relationship ? [relationship] : [];
          }),
        }),
        writer,
      );
    },
  };
}

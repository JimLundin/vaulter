import { frozen } from '../../vault/nodes/json.ts';
import type { NodeAddress, NodeVersion, Placement } from '../../vault/nodes/model.ts';
import type { NodeCommit, NodeSnapshot } from '../../vault/nodes/store.ts';
import type { TransactionKind } from '../../vault/nodes/operations.ts';
import { parseAnswer, parseQuestion } from './records.ts';
import { readQuestion } from './reading.ts';

declare module '../../vault/nodes/operations.ts' {
  interface TransactionActions {
    readonly questions: 'ask' | 'answer';
  }
}

export const questionOperations = {
  ask: { scope: 'questions', action: 'ask' },
  answer: { scope: 'questions', action: 'answer' },
} as const satisfies Readonly<Record<'ask' | 'answer', TransactionKind>>;

export type QuestionCommit = Omit<NodeCommit, 'recordedBy' | 'origin' | 'undoOf'>;
export interface AskQuestionOptions {
  readonly id: string;
  readonly node: string;
  readonly text: string;
  readonly subject?: string;
}
export interface AnswerQuestionOptions {
  readonly id: string;
  /** Stable identity of the newly recorded Answer. */
  readonly node: string;
  readonly relationship: string;
  /** The exact Question wording to which the person is responding. */
  readonly question: Required<NodeAddress>;
  readonly text: string;
  /** Retained incoming relationships may live outside reachable containment. */
  readonly relationships?: readonly NodeVersion[];
}

function appendOrder(view: NodeSnapshot, parent: string, reads: Record<string, string | null>) {
  const children = view.children(parent);
  for (const child of children) reads[child.key.node] = child.key.transaction;
  // Concurrent appends may share an order; the node model orders ties by stable identity.
  return `${children.at(-1)?.placement?.order ?? ''}z`;
}

/** Supported subjects must remain reachable; a section must belong to a live Wiki page. */
export function questionSubject(view: NodeSnapshot, node: string) {
  const subject = view.get(node);
  if (!(subject?.data && ['page', 'section'].includes(String(subject.data.kind))))
    throw new Error('Question subject must be a live Wiki page or section.');
  const expectedReads: Record<string, string | null> = {};
  const seen = new Set<string>();
  let current: NodeVersion | undefined = subject;
  let page = false;
  while (current) {
    if (!current.data || seen.has(current.key.node))
      throw new Error('Question subject is unavailable.');
    seen.add(current.key.node);
    expectedReads[current.key.node] = current.key.transaction;
    if (current.data.kind === 'page') page = true;
    if (!current.placement) break;
    current = view.get(current.placement.parent);
    if (!current) throw new Error('Question subject is unavailable.');
  }
  if (!page) throw new Error('Question section must belong to a live Wiki page.');
  return { subject, expectedReads };
}

/** Prepare one Question without publishing or choosing the trusted author's identity. */
export function prepareAskQuestion(
  view: NodeSnapshot,
  options: AskQuestionOptions,
): QuestionCommit {
  const data = parseQuestion({ kind: 'question', text: options.text.trim() });
  const expectedReads: Record<string, string | null> = {};
  let placement: Placement | null = null;
  if (options.subject) {
    Object.assign(expectedReads, questionSubject(view, options.subject).expectedReads);
    placement = {
      parent: options.subject,
      order: appendOrder(view, options.subject, expectedReads),
    };
  }
  return frozen({
    id: options.id,
    kind: questionOperations.ask,
    message: 'Ask a question',
    expectedReads,
    changes: [{ node: options.node, expected: null, data, placement, connection: null }],
  });
}

/** Record an Answer and its exact evidence link together, guarding the Question that was read. */
export function prepareAnswerQuestion(
  view: NodeSnapshot,
  options: AnswerQuestionOptions,
): QuestionCommit {
  const question = view.get(options.question.node);
  if (question?.data?.kind !== 'question') throw new Error('Question is unavailable.');
  parseQuestion(question.data);
  if (question.key.transaction !== options.question.transaction)
    throw new Error('Question has changed; review its current wording before answering.');
  const relationships: NodeVersion[] = [...(options.relationships ?? [])];
  const seen = new Set<string>();
  const visit = (node: NodeVersion) => {
    if (!node.data || seen.has(node.key.node)) return;
    seen.add(node.key.node);
    if (node.data.kind === 'relationship') relationships.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  const { status } = readQuestion(question, view, relationships)!;
  if (status !== 'open') throw new Error('Only an open Question can be answered.');
  const data = parseAnswer({ kind: 'answer', text: options.text.trim() });
  const expectedReads: Record<string, string | null> = {
    [question.key.node]: question.key.transaction,
  };
  for (const relationship of relationships)
    if (
      relationship.connection?.source.node === question.key.node ||
      relationship.placement?.parent === question.key.node
    )
      expectedReads[relationship.key.node] = relationship.key.transaction;
  const order = appendOrder(view, question.key.node, expectedReads);
  return frozen({
    id: options.id,
    kind: questionOperations.answer,
    message: 'Answer a question',
    expectedReads,
    changes: [
      {
        node: question.key.node,
        expected: question.key.transaction,
        data: question.data,
        placement: question.placement,
        connection: question.connection,
      },
      {
        node: options.node,
        expected: null,
        data,
        placement: { parent: question.key.node, order },
        connection: null,
      },
      {
        node: options.relationship,
        expected: null,
        data: { kind: 'relationship', predicate: 'answered-by' },
        placement: { parent: question.key.node, order: `${order}z` },
        connection: {
          source: question.key,
          target: { node: options.node, transaction: options.id },
        },
      },
    ],
  });
}

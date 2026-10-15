import { liveAncestry } from '../../vault/nodes/reading.ts';
import { frozen } from '../../vault/nodes/json.ts';
import type { NodeAddress, NodeVersion, Placement } from '../../vault/nodes/model.ts';
import type { NodeCommit, NodeSnapshot } from '../../vault/nodes/store.ts';
import type { TransactionKind } from '../../vault/nodes/operations.ts';
import { parseAnswer, parseQuestion, type AnswerSuggestion } from './records.ts';
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
  readonly suggestions?: readonly AnswerSuggestion[];
  /** Exact self-contained text versions read to prepare these proposals. */
  readonly source?: Required<NodeAddress>;
  readonly knowledge?: readonly Required<NodeAddress>[];
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

/** Prepare one Question without publishing or choosing the trusted author's identity. */
export function prepareAskQuestion(
  view: NodeSnapshot,
  options: AskQuestionOptions,
): QuestionCommit {
  const data = parseQuestion({
    kind: 'question',
    text: options.text.trim(),
    ...(options.suggestions ? { suggestions: options.suggestions } : {}),
  });
  const expectedReads: Record<string, string | null> = {};
  if (options.suggestions && !options.source)
    throw new Error('Suggested answers require the source of the Question.');
  const grounding = [
    ...(options.source ? [{ predicate: 'generated-from', address: options.source }] : []),
    ...(options.knowledge ?? []).map((address) => ({ predicate: 'informed-by', address })),
  ];
  for (const { address } of grounding) {
    const version = view.resolve(address);
    if (
      !(address.transaction && version?.data) ||
      view.get(address.node)?.key.transaction !== address.transaction
    )
      throw new Error('Question context has changed or is unavailable; read it again.');
    expectedReads[address.node] = address.transaction;
  }
  let placement: Placement | null = null;
  if (options.subject) {
    const ancestry = liveAncestry(view, options.subject);
    if (!ancestry) throw new Error('Question subject is unavailable.');
    for (const version of ancestry) expectedReads[version.key.node] = version.key.transaction;
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
    changes: [
      { node: options.node, expected: null, data, placement, connection: null },
      ...grounding.map(({ predicate, address }, index) => ({
        node: `${options.node}:context:${index}`,
        expected: null,
        data: { kind: 'relationship', predicate },
        placement: { parent: options.node, order: String(index).padStart(4, '0') },
        connection: {
          source: { node: options.node, transaction: options.id },
          target: address,
        },
      })),
    ],
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

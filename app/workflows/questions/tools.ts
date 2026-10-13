import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolContext } from '../../agent/tools.ts';
import type { JsonObject, NodeAddress, NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeStore } from '../../vault/nodes/store.ts';
import { prepareAskQuestion, questionSubject } from './operations.ts';
import { answerSuggestions, parseAnswer } from './records.ts';
import { readQuestions, type Question, type QuestionTarget } from './reading.ts';
import { questionToolActions } from './tool-actions.ts';

function visibleNodes(view: NodeSnapshot) {
  const result: NodeVersion[] = [];
  const seen = new Set<string>();
  const visit = (node: NodeVersion) => {
    if (!node.data || seen.has(node.key.node)) return;
    seen.add(node.key.node);
    result.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  return result;
}

function targetReceipt(target: QuestionTarget): JsonObject {
  return {
    state: target.state,
    ...(target.relationship ? { relationship: target.relationship } : {}),
    ...(target.address ? { ...target.address } : {}),
    ...(target.label ? { label: target.label } : {}),
    ...(target.version?.data?.kind === 'answer'
      ? { text: parseAnswer(target.version.data).text }
      : {}),
  };
}

function questionReceipt(question: Question): JsonObject {
  return {
    question: question.id,
    transaction: question.key.transaction,
    text: question.data.text,
    status: question.status,
    subjects: question.subjects.map(targetReceipt),
    answers: question.answers.map(targetReceipt),
    ...(question.data.suggestions ? { suggestions: question.data.suggestions } : {}),
    sources: (question.sources ?? []).map(targetReceipt),
    knowledge: (question.knowledge ?? []).map(targetReceipt),
  };
}

/** Product supplies foreign text ownership and distinguishes Wiki knowledge from source material. */
export interface QuestionContextReading {
  /** Only self-contained text versions: exact containers do not freeze their child prose. */
  readonly text: (node: NodeVersion, view: NodeSnapshot) => string | undefined;
  readonly isKnowledge: (node: NodeVersion, view: NodeSnapshot) => boolean;
  readonly title: (node: NodeVersion, view: NodeSnapshot) => string;
}

const exactAddress = z.strictObject({ node: z.string().min(1), transaction: z.string().min(1) });
const askInput = z.object({
  text: z.string().trim().min(1),
  subject: z.string().min(1).optional(),
  suggestions: answerSuggestions,
  source: exactAddress,
  /** Empty when no relevant knowledge exists; never invent grounding to fill it. */
  knowledge: z.array(exactAddress).max(6),
});

/** Agent tools retain requests for information; directly recorded answers belong to the person. */
export function questionTools(
  context: AgentToolContext,
  nodes: NodeStore,
  reading: QuestionContextReading,
) {
  const passage = (view: NodeSnapshot, address: Required<NodeAddress>, knowledge: boolean) => {
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
  const collection = async () => {
    const view = context.snapshot();
    const questions = await readQuestions(nodes, view);
    context.signal.throwIfAborted();
    return questions;
  };
  return {
    [questionToolActions.ask]: tool({
      description:
        'Retain an open question with 1–4 editable suggested answers prepared now. Use listQuestionContext to read the triggering source and relevant existing knowledge first. Supply each suggestion’s title, complete answer text and grounded reason, the exact source address and the exact knowledge addresses used. These are proposals for the owner, never accepted answers. Supply a Wiki subject to also show the Question there.',
      inputSchema: askInput,
      execute: async (input) => {
        context.signal.throwIfAborted();
        const preparedInput = askInput.parse(input);
        const view = context.snapshot();
        passage(view, preparedInput.source, false);
        for (const knowledge of preparedInput.knowledge) passage(view, knowledge, true);
        const question = crypto.randomUUID();
        const transaction = await context.commit(
          prepareAskQuestion(view, {
            ...preparedInput,
            node: question,
            id: crypto.randomUUID(),
          }),
        );
        return { question, transaction, accepted: true };
      },
    }),
    [questionToolActions.context]: tool({
      description:
        'Read self-contained retained source passages and existing Wiki knowledge for generating a Question and its suggested answers. Returned node/transaction pairs identify the exact text shown. Search with words from the source, subject or question; omit query to browse. Reading and suggesting never records an Answer.',
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query = '' }) => {
        const tracked = context.snapshot();
        // Discovery must not capture mutable execution records as dependencies of later asks.
        const view = await nodes.snapshot(tracked.sequence);
        context.signal.throwIfAborted();
        const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const found = visibleNodes(view)
          .flatMap((version) => {
            if (
              ['question', 'answer', 'agentRun', 'toolExecution'].includes(
                String(version.data?.kind),
              )
            )
              return [];
            const text = reading.text(version, view);
            if (!text?.trim()) return [];
            const title = reading.title(version, view);
            const haystack = `${title} ${text}`.toLocaleLowerCase();
            const score = terms.filter((term) => haystack.includes(term)).length;
            if (terms.length && !score) return [];
            return [
              {
                node: version.key.node,
                transaction: version.key.transaction,
                title,
                text,
                knowledge: reading.isKnowledge(version, view),
                score,
              },
            ];
          })
          .sort((first, second) => second.score - first.score);
        const receipt = ({ node, transaction, title, text }: (typeof found)[number]) => ({
          node,
          transaction,
          title,
          text,
        });
        return {
          sources: found
            .filter((entry) => !entry.knowledge)
            .slice(0, 20)
            .map(receipt),
          knowledge: found
            .filter((entry) => entry.knowledge)
            .slice(0, 20)
            .map(receipt),
        };
      },
    }),
    [questionToolActions.subjects]: tool({
      description:
        'List live Wiki pages and sections available as subjects for a retained Question.',
      inputSchema: z.object({}),
      execute: async () => {
        const view = context.snapshot();
        // Enumeration must not declare every mutable Agent execution record as a read dependency.
        // Validate the discovered subjects and their live ancestry through the tracked view below.
        const discovery = await nodes.snapshot(view.sequence);
        context.signal.throwIfAborted();
        return visibleNodes(discovery).flatMap((node) => {
          if (!['page', 'section'].includes(String(node.data?.kind))) return [];
          let expectedReads: Record<string, string | null>;
          try {
            ({ expectedReads } = questionSubject(view, node.key.node));
          } catch {
            return [];
          }
          const page = Object.keys(expectedReads)
            .map((identity) => view.get(identity))
            .find((entry) => entry?.data?.kind === 'page');
          const title = String(page?.data?.title ?? 'Wiki page');
          return [{ node: node.key.node, title, kind: String(node.data?.kind) }];
        });
      },
    }),
    [questionToolActions.read]: tool({
      description: 'Read a retained Question, its current status and recorded Answer evidence.',
      inputSchema: z.object({ node: z.string().min(1) }),
      execute: async ({ node }) => {
        const question = (await collection()).find((entry) => entry.id === node);
        if (!question) throw new Error('Question not found.');
        return questionReceipt(question);
      },
    }),
    [questionToolActions.list]: tool({
      description:
        'List retained Questions, including their subjects, status and recorded answers.',
      inputSchema: z.object({}),
      execute: async () => (await collection()).map(questionReceipt),
    }),
  };
}

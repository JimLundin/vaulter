import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolContext } from '../../agent/tools.ts';
import type { JsonObject, NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeSnapshot, NodeStore } from '../../vault/nodes/store.ts';
import { prepareAskQuestion, questionSubject } from './operations.ts';
import { parseAnswer } from './records.ts';
import { readQuestions, type Question, type QuestionTarget } from './reading.ts';

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
  };
}

/** Agent tools retain requests for information; directly recorded answers belong to the person. */
export function questionTools(context: AgentToolContext, nodes: NodeStore) {
  const collection = async () => {
    const view = context.snapshot();
    const questions = await readQuestions(nodes, view);
    context.signal.throwIfAborted();
    return questions;
  };
  return {
    askQuestion: tool({
      description:
        'Present and retain an open question for the Vault owner. Supply a Wiki subject identity to also show it on that page; omit the subject for the Questions collection.',
      inputSchema: z.object({
        text: z.string().trim().min(1),
        subject: z.string().min(1).optional(),
      }),
      execute: async (input) => {
        context.signal.throwIfAborted();
        const question = crypto.randomUUID();
        const transaction = await context.commit(
          prepareAskQuestion(context.snapshot(), {
            ...input,
            node: question,
            id: crypto.randomUUID(),
          }),
        );
        return { question, transaction, accepted: true };
      },
    }),
    listQuestionSubjects: tool({
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
    readQuestion: tool({
      description: 'Read a retained Question, its current status and recorded Answer evidence.',
      inputSchema: z.object({ node: z.string().min(1) }),
      execute: async ({ node }) => {
        const question = (await collection()).find((entry) => entry.id === node);
        if (!question) throw new Error('Question not found.');
        return questionReceipt(question);
      },
    }),
    listQuestions: tool({
      description:
        'List retained Questions, including their subjects, status and recorded answers.',
      inputSchema: z.object({}),
      execute: async () => (await collection()).map(questionReceipt),
    }),
  };
}

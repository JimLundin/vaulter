import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolContext } from '@/agent/tools.ts';
import type { JsonObject } from '@/vault/nodes/model.ts';
import type { NodeReading } from '@/vault/nodes/store.ts';
import { parseAnswer } from './records.ts';
import { askQuestionInput, createQuestionOwnership } from './actions.ts';
import { readQuestions, type Question, type QuestionTarget } from './reading.ts';
import { questionToolActions } from './tool-actions.ts';

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

/** Agent tools retain requests for information; directly recorded answers belong to the person. */
export function questionTools(
  context: AgentToolContext,
  nodes: NodeReading,
  ownership = createQuestionOwnership({ nodes }),
) {
  const collection = async () => {
    const view = context.snapshot();
    const questions = await readQuestions(nodes, view);
    context.signal.throwIfAborted();
    return questions;
  };
  return {
    [questionToolActions.ask]: tool({
      description:
        'Retain an open question with 1–4 editable suggested answers prepared now. Supply each suggestion’s title, complete answer text and grounded reason, the exact source address and the exact knowledge addresses used. These are proposals for the owner, never accepted answers. An optional subject is a live Node reference chosen by the Agent.',
      inputSchema: askQuestionInput,
      execute: async (input) => {
        context.signal.throwIfAborted();
        // Reject incomplete input before reading, including direct execution outside SDK validation.
        const preparedInput = askQuestionInput.parse(input);
        if (!context.author)
          throw new Error('Question creation requires a trusted Agent invocation.');
        const author = context.author;
        let question!: string;
        const transaction = await context.write((id) => {
          const prepared = ownership.ask(context.snapshot(), preparedInput, {
            id,
            kind: 'agent',
            recordedBy: author.recordedBy,
            origin: author.origin,
          });
          question = prepared.changes[0]!.node;
          return prepared;
        });
        return {
          question,
          transaction,
          accepted: true,
        };
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

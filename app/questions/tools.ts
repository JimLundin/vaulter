import { tool } from 'ai';
import { z } from 'zod';
import type { TransactionContext } from '@/application/store/index.ts';
import { askInput, questionActions } from './operations.ts';
import { readEavQuestions } from './projection.ts';
import type { QuestionDatabase } from './records.ts';

export const questionCapabilities = ['askQuestion', 'readQuestion', 'listQuestions'].map(
  (name) => ({ name, version: '2' }),
);
export function nativeQuestionTools(
  db: QuestionDatabase,
  context: TransactionContext,
  signal: AbortSignal,
) {
  const actions = questionActions(db, context, signal);
  const collection = async () => {
    signal.throwIfAborted();
    return readEavQuestions(db);
  };
  return {
    askQuestion: tool({
      description:
        'Retain an open question with 1–4 editable suggested answers and exact EAV source/knowledge addresses. Optional subject reuses an existing identity. Optional review links an unresolved review issue; an answer does not certify other claims.',
      inputSchema: askInput,
      execute: async (input) => {
        const question = await actions.ask(input);
        const latest = (await db.history.entities.questions.first({
          where: { entity: { eq: question } },
          select: { transaction: {} },
          orderBy: [{ sequence: 'desc' }],
        }))!;
        return {
          question: question.key,
          transaction: (await db.history.reference(latest.transaction, question)).transaction,
          accepted: true,
        };
      },
    }),
    readQuestion: tool({
      description: 'Read a retained Question and its recorded answer evidence.',
      inputSchema: z.object({ key: z.string().min(1) }),
      execute: async ({ key }) =>
        (await collection()).find((question) => question.id === key) ?? null,
    }),
    listQuestions: tool({
      description: 'List retained Questions with their subjects, status and recorded evidence.',
      inputSchema: z.object({}),
      execute: collection,
    }),
  };
}

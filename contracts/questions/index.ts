// Questions: how Vaulter asks when something is unclear, contradicts what was said before, or is a change it
// isn't sure of (ARCHITECTURE.md, "Vaulter proposes, you approve"). An extension asks under a topic of its
// own and handles answers under that topic; answers that arrive while it isn't running are delivered
// when it next registers its handler. Answering is personal: Vaulter can't answer its own questions.
import { defineContract } from '@vaulter/kernel';
import { z } from 'zod';
import { RecordRef } from '@contracts/records';

export type Unsubscribe = () => void;

export const NewQuestion = z.object({
  /** The asker's own topic: "merge-people", "unclear-date". */
  topic: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  /** Choices to pick from; with none, the answer is text. */
  choices: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) })).optional(),
  /** Whether text may be given besides (or instead of) a choice. */
  allowText: z.boolean().default(false),
  /** What it is about: records, and the notes it came from. */
  about: z.array(RecordRef).default([]),
  notes: z.array(z.string()).default([]),
  /** Asking again with the same key while one is open returns that one. */
  key: z.string().optional(),
  /** Anything the asker needs back with the answer. Plain values only. */
  data: z.json().optional(),
});

export const Answer = z
  .object({ choice: z.string().optional(), text: z.string().optional() })
  .refine((a) => a.choice !== undefined || a.text !== undefined, { message: 'a choice or text' });
export type Answer = z.infer<typeof Answer>;

export interface Question extends z.output<typeof NewQuestion> {
  id: string;
  /** The extension that asked. */
  from: string;
  at: string;
  status: 'open' | 'answered' | 'dismissed' | 'withdrawn';
  answer?: Answer;
}

export interface QuestionsV1 {
  /** Returns the question's id. */
  ask: (q: z.input<typeof NewQuestion>) => Promise<string>;
  /** The asker's handler for its topic; pending answers are delivered on registering. */
  handle: (
    topic: string,
    handler: (answer: Answer, question: Question) => void,
  ) => Promise<Unsubscribe>;
  /** The asker takes back its own question. */
  withdraw: (id: string) => Promise<void>;
  open: () => Promise<Question[]>;
  get: (id: string) => Promise<Question | undefined>;
  onChanged: (handler: (open: Question[]) => void) => Promise<Unsubscribe>;
  // Personal: a person answers.
  answer: (id: string, answer: Answer) => Promise<void>;
  dismiss: (id: string) => Promise<void>;
}

export const questions = defineContract<QuestionsV1>({
  name: 'questions',
  version: 1,
  personal: ['answer', 'dismiss'],
});

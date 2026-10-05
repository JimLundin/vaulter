// Questions: how Vaulter asks when something is unclear, contradicts what was said before, or is a change it
// isn't sure of (ARCHITECTURE.md, "Vaulter proposes, you approve"). An extension asks under a topic of its
// own and handles answers under that topic; answers that arrive while it isn't running are delivered
// when it next registers its handler. The person answers, on a screen; nothing answers for them.

import { z } from 'zod';
import type { Unsubscribe } from '#kernel';

export const NewQuestion = z.object({
  /** The asker's own topic: "merge-people", "unclear-date". */
  topic: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  /** Choices to pick from, one of which is the answer; with none, the answer is text. */
  choices: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .optional(),
  /** The notes it came from. */
  notes: z.array(z.string()).default([]),
  /** Asking again with the same key while one is open returns that one. */
  key: z.string().optional(),
  /** Anything the asker needs back with the answer. Plain values only. */
  data: z.json().optional(),
});

export const Answer = z
  .object({ choice: z.string().optional(), text: z.string().optional() })
  .refine((a) => a.choice !== undefined || a.text !== undefined, {
    message: 'a choice or text',
  });
export type Answer = z.infer<typeof Answer>;

export const Status = z.enum(['open', 'answered']);

export interface Question extends z.output<typeof NewQuestion> {
  id: string;
  /** The extension that asked. */
  from: string;
  at: string;
  status: z.infer<typeof Status>;
  answer?: Answer;
}

export interface Questions {
  /** Returns the question's id. */
  ask: (q: z.input<typeof NewQuestion>) => Promise<string>;
  /** The asker's handler for its topic; pending answers are delivered on registering. */
  handle: (
    topic: string,
    handler: (answer: Answer, question: Question) => unknown,
  ) => Promise<Unsubscribe>;
  open: () => Promise<Question[]>;
  get: (id: string) => Promise<Question | undefined>;
  // The person's, from a screen.
  answer: (id: string, answer: Answer) => Promise<void>;
}

// Questions: how Vaulter asks the person when something is unclear, or a
// change it isn't sure of. An extension asks under a topic of its own, and
// handles the answers under that topic, also after a restart.

import { z } from 'zod';
import type { Unsubscribe } from '#kernel';

/** A question as an extension asks it. */
export const NewQuestion = z.object({
  /** The asker's own topic, such as "merge-people". */
  topic: z.string().regex(/^[a-z][a-z0-9-]*$/),
  title: z.string().min(1).max(200),
  body: z.string().max(4000).optional(),
  /** What the person can pick. With none, the answer is text. */
  choices: z
    .array(z.object({ id: z.string().min(1), label: z.string().min(1) }))
    .optional(),
  /** The notes it came from. */
  notes: z.array(z.string()).default([]),
  /** Asking again with the same key, while one is open, returns that one. */
  key: z.string().optional(),
  /** Anything the asker needs back with the answer. */
  data: z.json().optional(),
});

/** The person's answer: one of the choices, or text. */
export const Answer = z
  .object({ choice: z.string().optional(), text: z.string().optional() })
  .refine((a) => a.choice !== undefined || a.text !== undefined, {
    message: 'a choice or text',
  });
export type Answer = z.infer<typeof Answer>;

export interface Question extends z.output<typeof NewQuestion> {
  id: string;
  /** The extension that asked. */
  from: string;
  at: string;
  status: 'open' | 'answered';
  answer?: Answer;
}

export type Handler = (answer: Answer, question: Question) => unknown;

export interface Questions {
  /** Asks, and returns the question's id. */
  ask: (question: z.input<typeof NewQuestion>) => Promise<string>;
  /** Handles the answers to the asker's questions on `topic`. Answers that
   * came while nothing handled them are delivered now. */
  handle: (topic: string, handler: Handler) => Promise<Unsubscribe>;
  open: () => Promise<Question[]>;
  get: (id: string) => Promise<Question | undefined>;
  /** The person's answer, from a screen. */
  answer: (id: string, answer: Answer) => Promise<void>;
}

// Notes: what was said or typed, as it was. A note is never changed or
// removed, so everything built from notes can be rebuilt from them.

import { z } from 'zod';
import type { Unsubscribe } from '#kernel';

/** A note as a person or an import gives it. */
export const NewNote = z.object({
  text: z.string().trim().min(1),
  source: z.enum(['typed', 'voice', 'import']).default('typed'),
  /** When it was said, if not now (for an import). */
  at: z.iso.datetime().optional(),
  /** What was around it, such as where, or the audio's id. */
  context: z.record(z.string(), z.json()).optional(),
});

export interface Note extends z.output<typeof NewNote> {
  id: string;
  at: string;
}

export interface NotesQuery {
  /** Said at or after `since`, and before `until`. */
  since?: string;
  until?: string;
  limit?: number;
  order?: 'newest' | 'oldest';
}

export interface Notes {
  append: (note: z.input<typeof NewNote>) => Promise<Note>;
  get: (id: string) => Promise<Note | undefined>;
  /** By when each was said, which for an import is not when it was kept. */
  list: (query?: NotesQuery) => Promise<Note[]>;
  onAppended: (listener: (note: Note) => void) => Unsubscribe;
}

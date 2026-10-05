// Notes: what was said or typed, as it was. Append-only: a note is never changed or removed, and every
// page and record built from notes can be rebuilt from them (ARCHITECTURE.md, principles).

import { z } from 'zod';
import { defineContract, type Unsubscribe } from '#kernel';

export const NewNote = z.object({
  text: z.string().trim().min(1),
  source: z.enum(['typed', 'voice', 'import']).default('typed'),
  /** When it was said, if not now (an import). */
  at: z.iso.datetime().optional(),
  /** What was around it: where, on which device, the audio's id. Plain values only. */
  context: z.record(z.string(), z.json()).optional(),
});

export interface Note extends z.output<typeof NewNote> {
  id: string;
  at: string;
}

export interface NotesQuery {
  /** Said at or after, and before. */
  since?: string;
  until?: string;
  limit?: number;
  order?: 'newest' | 'oldest';
}

export interface NotesV1 {
  append: (note: z.input<typeof NewNote>) => Promise<Note>;
  get: (id: string) => Promise<Note | undefined>;
  list: (query?: NotesQuery) => Promise<Note[]>;
  onAppended: (handler: (note: Note) => void) => Promise<Unsubscribe>;
}

export const notes = defineContract<NotesV1>({
  name: 'notes',
  version: 1,
});

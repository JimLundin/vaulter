// Notes: what you said or typed, as it was. Append-only: a note is never changed or removed, and every
// page and record built from notes can be rebuilt from them (ARCHITECTURE.md, principles).
import { defineContract } from '@pip/kernel';
import { z } from 'zod';
import type { Unsubscribe, Where } from '@contracts/records';

const fn = z.custom<(...args: never[]) => unknown>((f) => typeof f === 'function', {
  message: 'not a function',
});
export const NoteSource = z.enum(['typed', 'voice', 'import']);

export const NewNote = z.object({
  text: z.string().trim().min(1),
  source: NoteSource.default('typed'),
  /** When it was said, if not now (an import). */
  at: z.iso.datetime().optional(),
});

export interface Note {
  id: string;
  text: string;
  source: z.infer<typeof NoteSource>;
  at: string;
}

export interface NotesV1 {
  append: (note: z.input<typeof NewNote>) => Promise<Note>;
  get: (id: string) => Promise<Note | undefined>;
  /** Newest first, unless `order` says otherwise. */
  list: (where?: Where) => Promise<Note[]>;
  onAppended: (handler: (note: Note) => void) => Unsubscribe;
}

export const notes = defineContract<NotesV1>({
  name: 'notes',
  version: '1.0.0',
  inputs: {
    append: z.tuple([NewNote]),
    get: z.tuple([z.string()]),
    onAppended: z.tuple([fn]),
  },
});

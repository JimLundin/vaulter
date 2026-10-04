// Notes: what was said or typed, as it was. Append-only: a note is never changed or removed, and every
// page and record built from notes can be rebuilt from them (ARCHITECTURE.md, principles).
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export type Unsubscribe = () => void;

export const NoteSource = z.enum(['typed', 'voice', 'import']);

export const NewNote = z.object({
  text: z.string().trim().min(1),
  source: NoteSource.default('typed'),
  /** When it was said, if not now (an import). */
  at: z.iso.datetime().optional(),
  /** What was around it: where, on which device, the audio's id. Plain values only. */
  context: z.record(z.string(), z.json()).optional(),
});

export interface Note {
  id: string;
  text: string;
  source: z.infer<typeof NoteSource>;
  at: string;
  context?: Record<string, unknown>;
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

const fn = z.custom<(...args: never[]) => unknown>((f) => typeof f === 'function', {
  message: 'not a function',
});

export const notes = defineContract<NotesV1>({
  name: 'notes',
  version: '1.0.0',
  inputs: {
    append: z.tuple([NewNote]),
    get: z.tuple([z.string()]),
    list: z.tuple([
      z
        .object({
          since: z.string().optional(),
          until: z.string().optional(),
          limit: z.number().int().positive().optional(),
          order: z.enum(['newest', 'oldest']).optional(),
        })
        .optional(),
    ]),
    onAppended: z.tuple([fn]),
  },
});

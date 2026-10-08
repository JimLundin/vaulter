// Notes' tools for the agent, loaded with it: renaming a note (model/rename.ts), staged like any edit.
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { Change } from '../../core/files.ts';
import { renameNote } from './model/rename.ts';
import type { AgentContext } from '../../core/extension.ts';

export const notesTools = ({ w }: AgentContext) =>
  ({
    renameNote: tool({
      description:
        'Stage renaming a note ("Ada.md" → "Ada Lovelace.md"), or switching it between .md and .mdx (same name, other extension): moves the file and rewrites every link and frontmatter reference to it. Structural: only on Jim\'s yes, in its own vault: commit (conventions §16).',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: async ({ from, to }) => {
        let changes: Change[];
        try {
          changes = renameNote(w.files(), from, to);
        } catch (e) {
          return { error: (e as Error).message };
        }
        // biome-ignore lint/performance/noAwaitInLoops: one at a time; each stage builds on the overlay the last one wrote
        for (const c of changes) await w.stage(c.path, c.text);
        return { staged: w.staged() };
      },
    }),
  }) satisfies ToolSet;

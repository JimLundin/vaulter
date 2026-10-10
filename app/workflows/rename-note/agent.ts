// Model input adapter to the named rename operation.
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { OwnedVault } from '../../vault/index.ts';
import { renameNote } from './index.ts';

export const renameTools = (vault: OwnedVault) =>
  ({
    renameNote: tool({
      description:
        'Stage renaming a note ("Ada.md" → "Ada Lovelace.md"): moves the file and rewrites every link and frontmatter reference to it. Structural: only on Jim\'s yes, in its own vault: commit (conventions §16).',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      execute: async (input) => {
        try {
          return await renameNote(vault, input);
        } catch (error) {
          return { error: (error as Error).message };
        }
      },
    }),
  }) satisfies ToolSet;

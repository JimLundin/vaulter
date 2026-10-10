import { tool } from 'ai';
import { z } from 'zod';
import type { AgentToolFactory } from './tools.ts';

// Fictional feature operation used to verify Product-supplied tools with either conversation mode.
declare module '../vault/nodes/operations.ts' {
  interface TransactionActions {
    readonly paragraphFixture: 'capture';
  }
}
export const paragraphTools: AgentToolFactory = (context) => ({
  captureParagraph: tool({
    description: 'Capture a paragraph with the supplied feature rules.',
    inputSchema: z.object({
      text: z
        .string()
        .min(1)
        .transform((text) => `note:${text}`),
    }),
    execute: async ({ text }) => {
      const node = crypto.randomUUID();
      const transaction = await context.commit({
        id: crypto.randomUUID(),
        kind: { scope: 'paragraphFixture', action: 'capture' },
        message: null,
        changes: [
          {
            node,
            expected: null,
            data: { kind: 'paragraph', text },
            placement: null,
            connection: null,
          },
        ],
      });
      return { node, transaction, text };
    },
  }),
});

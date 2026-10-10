// Content module operations: accepted publication is immediate, without legacy file staging.
import { tool } from 'ai';
import { z } from 'zod';
import type { NodeCommit, NodeSnapshot, NodeDifference } from '../nodes/store.ts';
import { nodeOperations } from '../nodes/operations.ts';

interface ContentContext {
  readonly signal: AbortSignal;
  readonly snapshot: () => NodeSnapshot;
  readonly commit: (
    request: Omit<NodeCommit, 'recordedBy' | 'origin' | 'undoOf'>,
  ) => Promise<string>;
}
const content = z.object({ title: z.string().trim().min(1).max(200), text: z.string().min(1) });
const read = (context: ContentContext, node: string) => {
  const version = context.snapshot().get(node);
  if (version?.data?.kind !== 'content') throw new Error('Content node not found.');
  return version;
};
export function nodeContentTools(context: ContentContext) {
  return {
    createNode: tool({
      description:
        'Create and publish a content node in the Vault. Returns its identity and accepted transaction.',
      inputSchema: content,
      execute: async (input) => {
        context.signal.throwIfAborted();
        const node = crypto.randomUUID();
        const transaction = await context.commit({
          id: crypto.randomUUID(),
          kind: nodeOperations.create,
          message: `Create ${input.title}`,
          changes: [
            {
              node,
              expected: null,
              placement: null,
              connection: null,
              data: { kind: 'content', ...input },
            },
          ],
        });
        return { node, transaction, accepted: true };
      },
    }),
    readNode: tool({
      description: 'Read a content node at its current exact version.',
      inputSchema: z.object({ node: z.string().min(1) }),
      execute: ({ node }) => {
        const version = read(context, node);
        return { node, transaction: version.key.transaction, data: version.data };
      },
    }),
    updateNode: tool({
      description: 'Update a content node, preserving its identity and prior versions.',
      inputSchema: content.extend({ node: z.string().min(1) }),
      execute: async ({ node, ...input }) => {
        const version = read(context, node);
        const transaction = await context.commit({
          id: crypto.randomUUID(),
          kind: nodeOperations.update,
          message: `Update ${input.title}`,
          changes: [
            {
              node,
              expected: version.key.transaction,
              placement: version.placement,
              connection: version.connection,
              data: { ...version.data, kind: 'content', ...input },
            },
          ],
        });
        return { node, transaction, accepted: true };
      },
    }),
  };
}

/** Compensation accepts only this module's content on both sides, including deletion/creation. */
export function canUndoContent({ before, after }: NodeDifference) {
  return [before, after].every(
    (version) => version?.data == null || version.data.kind === 'content',
  );
}

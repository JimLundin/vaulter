// Agent discovers retained evidence and chooses how its actions connect records.
import { tool } from 'ai';
import { z } from 'zod';
import type { NodeAddress, NodeVersion } from '../vault/nodes/model.ts';
import type { NodeSnapshot, NodeReading } from '../vault/nodes/store.ts';
import type { AgentToolContext } from './tools.ts';

// Retained tool identities continue to describe the same Agent discovery actions.
export const discoveryActions = {
  context: 'listQuestionContext',
  subjects: 'listQuestionSubjects',
} as const;
export const discoveryEnabledTools = Object.values(discoveryActions).map((name) => ({ name }));

export interface AgentContextReading {
  readonly text: (node: NodeVersion, view: NodeSnapshot) => string | undefined;
  readonly isKnowledge: (node: NodeVersion, view: NodeSnapshot) => boolean;
  readonly title: (node: NodeVersion, view: NodeSnapshot) => string;
  readonly subjects: (
    discovery: NodeSnapshot,
    selected: NodeSnapshot,
  ) => readonly {
    readonly node: string;
    readonly title: string;
    readonly kind: string;
  }[];
}

function visibleNodes(view: NodeSnapshot) {
  const result: NodeVersion[] = [];
  const seen = new Set<string>();
  const visit = (node: NodeVersion) => {
    if (!node.data || seen.has(node.key.node)) return;
    seen.add(node.key.node);
    result.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  return result;
}

export function agentDiscoveryTools(
  context: AgentToolContext,
  nodes: NodeReading,
  reading: AgentContextReading,
) {
  return {
    [discoveryActions.context]: tool({
      description:
        'Read self-contained retained source passages and existing Wiki knowledge for generating a Question and its suggested answers. Returned node/transaction pairs identify the exact text shown. Search with words from the source, subject or question; omit query to browse. Reading and suggesting never records an Answer.',
      inputSchema: z.object({ query: z.string().optional() }),
      execute: async ({ query = '' }) => {
        const tracked = context.snapshot();
        // Discovery must not capture mutable execution records as dependencies of later asks.
        const view = await nodes.snapshot(tracked.sequence);
        context.signal.throwIfAborted();
        const terms = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
        const found = visibleNodes(view)
          .flatMap((version) => {
            if (['agentRun', 'toolExecution'].includes(String(version.data?.kind))) return [];
            const text = reading.text(version, view);
            if (!text?.trim()) return [];
            const title = reading.title(version, view);
            const haystack = `${title} ${text}`.toLocaleLowerCase();
            const score = terms.filter((term) => haystack.includes(term)).length;
            if (terms.length && !score) return [];
            return [
              {
                node: version.key.node,
                transaction: version.key.transaction,
                title,
                text,
                knowledge: reading.isKnowledge(version, view),
                score,
              },
            ];
          })
          .sort((first, second) => second.score - first.score);
        const receipt = ({ node, transaction, title, text }: (typeof found)[number]) => ({
          node,
          transaction,
          title,
          text,
        });
        return {
          sources: found
            .filter((entry) => !entry.knowledge)
            .slice(0, 20)
            .map(receipt),
          knowledge: found
            .filter((entry) => entry.knowledge)
            .slice(0, 20)
            .map(receipt),
        };
      },
    }),
    [discoveryActions.subjects]: tool({
      description:
        'List live Wiki pages and sections available as subjects for a retained Question.',
      inputSchema: z.object({}),
      execute: async () => {
        const view = context.snapshot();
        // Enumeration must not declare every mutable Agent execution record as a read dependency.
        // Validate the discovered subjects and their live ancestry through the tracked view below.
        const discovery = await nodes.snapshot(view.sequence);
        context.signal.throwIfAborted();
        return reading.subjects(discovery, view).map(({ node, title, kind }) => ({
          node,
          title,
          kind,
        }));
      },
    }),
  };
}

/** Grounding is an Agent decision. Record actions accept the chosen exact references. */
export function validateAgentContext(
  view: NodeSnapshot,
  input: {
    readonly source: Required<NodeAddress>;
    readonly knowledge: readonly Required<NodeAddress>[];
  },
  reading: AgentContextReading,
) {
  const passage = (address: Required<NodeAddress>, knowledge: boolean) => {
    const version = view.resolve(address);
    if (!version?.data || view.get(address.node)?.key.transaction !== address.transaction)
      throw new Error('Question context has changed or is unavailable; read it again.');
    if (!reading.text(version, view)?.trim())
      throw new Error('Question context requires a self-contained text version.');
    if (reading.isKnowledge(version, view) !== knowledge)
      throw new Error(
        knowledge
          ? 'Existing knowledge must be Wiki text.'
          : 'The Question source must be retained source material.',
      );
  };
  passage(input.source, false);
  for (const knowledge of input.knowledge) passage(knowledge, true);
}

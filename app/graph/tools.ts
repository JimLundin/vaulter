import { tool } from 'ai';
import { z } from 'zod';
import type { TransactionContext, EntityRef, EntityDefinition } from '@/application/store/index.ts';
import type { GraphDatabase } from '@/graph/reading.ts';
import { readGraph } from '@/graph/reading.ts';
import { graphActions } from './operations.ts';
import { topicActions, readTopics, topicMembers } from './topics.ts';

const key = z.string().trim().min(1);
const address = z.strictObject({
  format: z.literal('vaulter-eav-snapshot-v1'),
  scope: key,
  journal: key,
  transaction: key,
  entity: key,
  type: key,
});
export const graphCapabilities = [
  'readGraph',
  'createRelationship',
  'removeRelationship',
  'createGraphTerm',
  'createGraphQuery',
  'promoteTopic',
  'addTopicMember',
  'listTopics',
  'readTopicMembers',
].map((name) => ({ name, version: '1' }));

/** Native tool effects finish at EAV acceptance; trusted attribution never comes from model input. */
export function graphTools(db: GraphDatabase, context: TransactionContext, signal: AbortSignal) {
  const actions = graphActions(db, context, signal);
  const topics = topicActions(db, context, signal);
  const check = () => signal.throwIfAborted();
  const receipt = async (entity: EntityRef<EntityDefinition>) => {
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    return { accepted: true, address: await db.history.reference(snapshot, entity) };
  };
  return {
    readGraph: tool({
      description:
        'Read recorded connections and vocabulary for an exact EAV identity. Recorded connections do not establish reviewed factual support.',
      inputSchema: z.strictObject({ entity: key, transaction: key.optional() }),
      execute: async (input) => {
        check();
        const graph = await readGraph(db);
        return {
          sequence: graph.sequence,
          relationships: graph.relationships(input),
          classifications: graph.classifications(input),
        };
      },
    }),
    createRelationship: tool({
      description:
        'Retain a directed named connection with exact accepted EAV source and target addresses. An unresolved target requires its retained label.',
      inputSchema: z.strictObject({
        key,
        predicate: key,
        source: address,
        target: address.optional(),
        label: key.optional(),
      }),
      execute: async (input) => {
        check();
        return receipt(await actions.connect(input));
      },
    }),
    removeRelationship: tool({
      description:
        'Remove a connection from current Graph reading while preserving its accepted history.',
      inputSchema: z.strictObject({ key }),
      execute: async ({ key }) => {
        check();
        await actions.remove(key);
        return { accepted: true, key };
      },
    }),
    createGraphTerm: tool({
      description:
        'Create controlled Graph vocabulary, including predicate labels and inverse or symmetric direction labels.',
      inputSchema: z.strictObject({
        key,
        scheme: key,
        label: key.optional(),
        use: key.optional(),
        inverse: key.optional(),
        symmetric: z.boolean().optional(),
      }),
      execute: async (input) => {
        check();
        const entity = await db.transaction(context, async (tx) => {
          check();
          if (
            await tx.entities.graphTerms.first({
              where: { key: { eq: input.key }, scheme: { eq: input.scheme } },
              select: {},
            })
          )
            throw new Error('Term already exists in this scheme');
          return tx.entities.graphTerms.insert({ ...input, available: true });
        });
        return receipt(entity);
      },
    }),
    createGraphQuery: tool({
      description:
        'Retain a typed Graph query selecting owner-supplied content by type/tag and title/creation ordering.',
      inputSchema: z.strictObject({
        key,
        type: key.optional(),
        tag: key.optional(),
        sort: z.enum(['title', 'created']).optional(),
      }),
      execute: async (input) => {
        check();
        const entity = await db.transaction(context, async (tx) => {
          check();
          if (
            await tx.entities.graphQueries.first({ where: { key: { eq: input.key } }, select: {} })
          )
            throw new Error('Graph query key is already in use');
          return tx.entities.graphQueries.insert({ ...input, available: true });
        });
        return receipt(entity);
      },
    }),
    promoteTopic: tool({
      description:
        'Explicitly promote an existing subject to a broad editorial Topic with a rationale. Page creation never promotes a Topic automatically.',
      inputSchema: z.strictObject({ key, subject: address, title: key, rationale: key }),
      execute: async (input) => {
        check();
        return receipt(await topics.promote(input));
      },
    }),
    addTopicMember: tool({
      description:
        'Associate narrower subject/material with a broad Topic. Editorial membership does not assert a factual relationship.',
      inputSchema: z.strictObject({
        topic: key,
        member: address,
        primary: z.boolean(),
        rationale: key,
      }),
      execute: async ({ topic, member, primary, rationale }) => {
        check();
        return receipt(await topics.addMember(topic, member, primary, rationale));
      },
    }),
    listTopics: tool({
      description: 'List explicitly promoted broad Topics with retained subject addresses.',
      inputSchema: z.strictObject({}),
      execute: async () => {
        check();
        return readTopics(db);
      },
    }),
    readTopicMembers: tool({
      description: 'Read a bounded editorial Topic neighborhood and disclose additional members.',
      inputSchema: z.strictObject({ key, limit: z.number().int().min(1).max(100).default(20) }),
      execute: async ({ key, limit }) => {
        check();
        return topicMembers(db, key, limit);
      },
    }),
  };
}

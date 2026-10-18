import {
  sameEntity,
  type DomainDatabase,
  type HistoricalReference,
  type TransactionContext,
} from '@/application/store/index.ts';
import type { topicEntities } from './records.ts';

type TopicDatabase = DomainDatabase<typeof topicEntities>;
export function topicActions(db: TopicDatabase, context: TransactionContext, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (!context.author) throw new Error('Topic organization requires trusted attribution');
  return {
    promote: async (input: {
      key: string;
      subject: HistoricalReference;
      title: string;
      rationale: string;
    }) => {
      signal?.throwIfAborted();
      if (![input.key, input.title, input.rationale].every((value) => value.trim()))
        throw new Error('Topic promotion requires a key, title and rationale');
      await db.history.resolve(input.subject);
      return db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        const topics = await tx.entities.topics.query({
          limit: null, // Topic uniqueness and membership admission must inspect all relevant retained associations.
          select: { subject: true, key: true },
        });
        if (
          topics.some(
            (topic) => topic.key === input.key || topic.subject.entity === input.subject.entity,
          )
        )
          throw new Error('Subject is already promoted or topic key is in use');
        signal?.throwIfAborted();
        return tx.entities.topics.insert({ ...input, available: true });
      });
    },
    addMember: async (
      key: string,
      member: HistoricalReference,
      primary: boolean,
      rationale: string,
    ) => {
      signal?.throwIfAborted();
      await db.history.resolve(member);
      if (!rationale.trim()) throw new Error('Topic membership requires a rationale');
      return db.transaction(context, async (tx) => {
        signal?.throwIfAborted();
        const topic = await tx.entities.topics.first({
          where: { key: { eq: key } },
          select: { available: true },
        });
        if (!topic?.available) throw new Error('Topic is unavailable');
        const memberships = await tx.entities.topicMemberships.query({
          limit: null, // Topic uniqueness and membership admission must inspect all relevant retained associations.
          select: { topic: true, member: true, primary: true },
        });
        if (
          memberships.some(
            (item) =>
              item.member.entity === member.entity &&
              (sameEntity(item.topic, topic) || (primary && item.primary)),
          )
        )
          throw new Error('Membership already exists or primary topic is already selected');
        signal?.throwIfAborted();
        return tx.entities.topicMemberships.insert({ topic, member, primary, rationale });
      });
    },
  };
}

export async function readTopics(db: TopicDatabase) {
  return (
    await db.entities.topics.query({
      limit: null, // Topic uniqueness and membership admission must inspect all relevant retained associations.
      where: { available: { eq: true } },
      select: { key: true, title: true, subject: true },
      orderBy: [{ title: 'asc' }],
    })
  ).map((topic) => ({
    id: topic.key,
    title: topic.title,
    subject: topic.subject,
    blocks: [],
    metadata: [],
  }));
}
/** Retrieve a bounded neighborhood before constructing the graph. */
export async function topicMembers(db: TopicDatabase, key: string, limit = 20) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new Error('Topic member limit must be between 1 and 100');
  const topic = await db.entities.topics.first({
    where: { key: { eq: key }, available: { eq: true } },
    select: {},
  });
  if (!topic) return { members: [], hasMore: false };
  const memberships = await db.entities.topicMemberships.query({
    where: { topic: { eq: topic } },
    select: { member: true, primary: true },
    limit: limit + 1,
  });
  return { members: memberships.slice(0, limit), hasMore: memberships.length > limit };
}

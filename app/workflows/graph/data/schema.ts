import { e } from '@/vault/eav/index.ts';

/** Editorial organization is explicit; page creation never promotes a Topic. */
export const Topic = e.entity('graph.topic', {
  key: e.string(),
  subject: e.historicalRef(),
  title: e.string(),
  rationale: e.string(),
  available: e.boolean(),
});
export const TopicMembership = e.entity('graph.topicMembership', {
  topic: e.ref(Topic),
  member: e.historicalRef(),
  primary: e.boolean(),
  rationale: e.string(),
});
export const topicEntities = { topics: Topic, topicMemberships: TopicMembership } as const;

import { e } from '@/core/store/index.ts';

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

/** Named connections retain accepted endpoint snapshots independently of editorial placement. */
export const Relationship = e.entity('graph.relationship', {
  key: e.string(),
  predicate: e.string(),
  source: e.historicalRef(),
  target: e.historicalRef().optional(),
  label: e.string().optional(),
  available: e.boolean(),
});
export const Term = e.entity('graph.term', {
  key: e.string(),
  scheme: e.string(),
  label: e.string().optional(),
  use: e.string().optional(),
  inverse: e.string().optional(),
  symmetric: e.boolean().optional(),
  available: e.boolean(),
});
export const Query = e.entity('graph.query', {
  key: e.string(),
  type: e.string().optional(),
  tag: e.string().optional(),
  sort: e.enum('title', 'created').optional(),
  available: e.boolean(),
});
export const graphEntities = {
  ...topicEntities,
  graphRelationships: Relationship,
  graphTerms: Term,
  graphQueries: Query,
} as const;

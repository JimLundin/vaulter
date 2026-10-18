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
  predicate: e.string().optional(),
  source: e.historicalRef().optional(),
  target: e.historicalRef().optional(),
  sourceState: e.retainedStateRef().optional(),
  targetState: e.retainedStateRef().optional(),
  label: e.string().optional(),
  status: e.enum('candidate', 'resolved').optional(),
  direction: e.enum('directed', 'unknown').optional(),
  clarificationReason: e.string().optional(),
  provenance: e.historicalRef().optional(),
  provenanceState: e.retainedStateRef().optional(),
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
  provenance: e.retainedStateRef().optional(),
  available: e.boolean(),
});
/** A captured evaluation is new evidence, separate from the saved definition and host. */
export const QuerySelection = e.entity('graph.querySelection', {
  key: e.string(),
  query: e.historicalRef(),
  origin: e.enum('migration-evaluation'),
  provenance: e.retainedStateRef(),
  available: e.boolean(),
});
export const QuerySelectionMember = e.entity('graph.querySelectionMember', {
  selection: e.ref(QuerySelection),
  page: e.historicalRef(),
  correspondence: e.retainedStateRef(),
  position: e.number(),
  classificationType: e.string().optional(),
  classificationTags: e.set(e.string()).optional(),
  classificationCutoff: e.retainedStateRef().optional(),
  classificationSources: e.set(e.retainedStateRef()).optional(),
  classificationHashes: e.set(e.string()).optional(),
});
export const graphEntities = {
  ...topicEntities,
  graphRelationships: Relationship,
  graphTerms: Term,
  graphQueries: Query,
  graphQuerySelections: QuerySelection,
  graphQuerySelectionMembers: QuerySelectionMember,
} as const;

import type { WikiRelatedContentReading } from './related-content.ts';

/** Isolated Wiki tests supply foreign interpretation; real Graph composition is tested in Application. */
export const unrelatedContent: WikiRelatedContentReading = () => ({
  classifications: () => [],
  relationship: (node) => node.data!,
  query: (_, candidates) => candidates,
});

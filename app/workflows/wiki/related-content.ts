import type { JsonObject, NodeAddress, NodeVersion } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type { WikiClassification } from './pages.ts';

/** Supplied by Application for this exact Snapshot; Wiki owns candidate pages and their rendering. */
export interface WikiRelatedContent {
  readonly classifications: (
    address: NodeAddress,
  ) => readonly (WikiClassification & { predicate: string })[];
  readonly relationship: (node: NodeVersion) => JsonObject;
  readonly query: <Candidate extends { node: string; title: string; created?: string }>(
    node: NodeVersion,
    candidates: readonly Candidate[],
  ) => readonly Candidate[];
}
export type WikiRelatedContentReading = (view: NodeSnapshot) => WikiRelatedContent;

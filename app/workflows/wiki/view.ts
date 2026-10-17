import type { JsonValue, HistoricalReference } from '@/vault/eav/index.ts';
import type { Entry } from '@/search/entries.ts';

export interface WikiReference {
  id: string;
  title: string;
  text: string;
  context: string;
  range?: { start: number; end: number };
  claim?: { start: number; end: number };
  date?: string;
  author?: string;
  href?: string;
  state: 'original' | 'newer' | 'deleted';
  source?: { node: string; transaction: string };
  address?: HistoricalReference;
  sequence: number;
  speaker?: 'user' | 'agent';
}
export interface WikiClassification {
  id: string;
  relationship: string;
  scheme: string;
  key: string;
  label: string;
  state: 'resolved' | 'unresolved' | 'deleted';
}

export interface WikiBlock {
  id: string;
  data: { readonly [key: string]: JsonValue };
  children: WikiBlock[];
  href?: string;
  evidence: WikiReference[];
  support?: SupportState;
}
export interface SupportState {
  readonly needsReference: boolean;
  readonly partlySupported: boolean;
  readonly supported: boolean;
  readonly disputed: boolean;
  readonly needsReview: boolean;
}
export interface WikiPage {
  id: string;
  title: string;
  summary: string;
  kind: string;
  updated: string;
  blocks: WikiBlock[];
  entry: Entry;
  metadata: WikiClassification[];
  sources: WikiReference[];
  summarySupport?: SupportState;
  summaryEvidence?: WikiReference[];
}

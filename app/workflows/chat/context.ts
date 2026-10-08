import type { Hit } from '../../vault/documents/search.ts';
import type { Vault } from '../../vault/index.ts';

export interface AgentContext {
  w: Vault;
  search: (query: string) => Hit[];
  capture?: (judged: {
    procedure: string;
    summary: string;
    topics: string[];
    where?: string[];
  }) => Promise<{ path: string; at: string; raw: string }>;
}

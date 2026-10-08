import type { Hit } from '../../vault/documents/search.ts';
import type { OwnedVault } from '../../vault/index.ts';

export interface AgentContext {
  w: OwnedVault;
  search: (query: string) => Hit[];
  capture?: (judged: {
    procedure: string;
    summary: string;
    topics: string[];
    where?: string[];
  }) => Promise<{ path: string; at: string; raw: string }>;
}

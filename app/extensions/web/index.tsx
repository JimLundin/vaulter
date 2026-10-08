// The web as agent tools (tools.ts): search with the sealed Jina key (VAULT_JINA_KEY), and reading any page,
// which works without one. No page of its own.
import type { Extension } from '../../shell/extension.ts';

export const web: Extension = {
  id: 'web',
  tools: async ({ secrets }) => (await import('./tools.ts')).webTools(secrets?.jina),
};

// The app's own source as agent tools (tools.ts): the agent reads, changes and commits vaulter itself, so
// the app grows with use. No page; needs the sealed token, which can write to vaulter.
import type { Extension } from '../../core/extension.ts';

export const code: Extension = {
  id: 'code',
  tools: async ({ github }) => (github ? (await import('./tools.ts')).codeTools(github) : {}),
};

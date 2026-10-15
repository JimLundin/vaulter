import type { SettingsDefinition } from '../../settings/store.ts';

export const jinaSettings: SettingsDefinition = {
  id: 'jina',
  name: 'Jina',
  fields: [
    {
      key: 'jina',
      label: 'Jina API key',
      description: 'Preloaded for web search. The current agent does not yet use Jina.',
      kind: 'secret',
    },
  ],
};

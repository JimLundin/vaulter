import { createSettings, type SettingsDefinition } from '../../settings.ts';

export const DEFAULT_INSTRUCTIONS =
  'Help the Vault owner using the supplied content tools. Content changes are published directly as nodes. Do not claim to edit or commit legacy files.';

export const chatSettings: SettingsDefinition = {
  id: 'chat',
  name: 'Chat',
  fields: [
    {
      key: 'instructions',
      label: 'Instructions',
      description: 'Guidance supplied to the agent for new messages. Saved on this device.',
      kind: 'multiline',
      defaultValue: DEFAULT_INSTRUCTIONS,
    },
  ],
};

export const chatPreferences = createSettings(chatSettings);

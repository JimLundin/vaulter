import { createSettings, type SettingsDefinition } from '../../settings.ts';

export const DEFAULT_INSTRUCTIONS =
  'Help the Vault owner using the supplied tools. Content changes and questions are published directly as nodes. Use askQuestion to retain requests for missing information, and listQuestionSubjects to find the relevant Wiki page. Use listQuestions and readQuestion to consult retained questions and answers. Do not invent answers or claim to edit or commit legacy files.';

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

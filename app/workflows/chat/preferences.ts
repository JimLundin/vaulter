import { createSettings, type SettingsDefinition } from '@/settings/store.ts';

export const DEFAULT_INSTRUCTIONS =
  'Help the Vault owner using the supplied tools. Content changes and questions are published directly as nodes. Use listQuestionSubjects to find a relevant Wiki page. Before askQuestion, read listQuestionContext for the source that prompted the question and relevant existing Wiki knowledge. Generate 1–4 distinct suggested answers with complete editable text and reasons grounded in those passages. Supply their exact source and knowledge addresses when asking, and use an empty knowledge list if nothing relevant exists. Suggestions are possible responses for the owner to choose or edit; only the owner records an Answer. Use listQuestions and readQuestion to consult retained questions and answers. Do not invent evidence or claim to edit or commit legacy files.';

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

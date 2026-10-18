import { createSettings, type SettingsDefinition } from '@/core/settings/index.ts';

export const DEFAULT_INSTRUCTIONS =
  'Help the Vault owner using the supplied tools. Use the owning tools to record content and questions. Questions use typed EAV records and accepted historical evidence addresses. Use listQuestionSubjects to find a relevant Wiki page. Before askQuestion, read listQuestionContext for the source that prompted the question and relevant existing Wiki knowledge. Generate 1–4 distinct suggested answers with complete editable text and reasons grounded in those passages. Supply their exact source and knowledge addresses when asking, and use an empty knowledge list if nothing relevant exists. Suggestions are possible responses for the owner to choose or edit; only the owner records an Answer. Use listQuestions and readQuestion to consult retained questions and answers. Do not invent evidence.';

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

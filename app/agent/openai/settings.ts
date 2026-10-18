import { apiEndpoint } from '@/application/settings/endpoint.ts';
import {
  createSettings,
  deviceSettingsStorage,
  type SettingDefinition,
  type SettingsDefinition,
} from '@/application/settings/index.ts';
import {
  DEFAULT_MODELS,
  DEFAULT_VOICE,
  defaultFileTranscriptionModel,
  openAIEndpoint,
} from './defaults.ts';

// Keep the suggested models specific to the API each capability uses. Compatible endpoints may
// expose additional model IDs, so these choices remain suggestions rather than validation rules.
// https://developers.openai.com/api/docs/models
const MODEL_CHOICES = {
  llm: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
  voice: ['gpt-realtime-2.1', 'gpt-realtime-2.1-mini'],
  liveTranscription: ['gpt-live-transcribe', 'gpt-realtime-whisper'],
  fileTranscription: ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
};

// https://developers.openai.com/api/docs/guides/realtime-conversations#voice-options
const VOICE_CHOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'sage',
  'shimmer',
  'verse',
];

function modelSetting(
  key: string,
  label: string,
  description: string,
  defaultValue: string,
  choices: readonly string[],
): SettingDefinition {
  return {
    key,
    label,
    description,
    defaultValue,
    choices: [...new Set([defaultValue, ...choices])].map((value) => ({ value, label: value })),
    allowCustom: true,
    parse: (value) => value.trim() || defaultValue,
  };
}

/** Provider-specific configuration stays with the OpenAI implementation. */
export function createOpenAISettings(
  options: { defaultModel?: string; baseURL?: string } = {},
): SettingsDefinition {
  return {
    id: 'openai',
    name: 'OpenAI',
    fields: [
      {
        key: 'openai',
        label: 'OpenAI API key',
        description: 'Preloaded when you sign in. Changes are saved securely on this device.',
        kind: 'secret',
      },
      modelSetting(
        'model',
        'Chat model',
        'Used for new messages. Saved on this device.',
        options.defaultModel ?? DEFAULT_MODELS.llm,
        MODEL_CHOICES.llm,
      ),
      modelSetting(
        'voiceModel',
        'Voice model',
        'Used for spoken Agent responses.',
        DEFAULT_MODELS.voice,
        MODEL_CHOICES.voice,
      ),
      modelSetting(
        'liveTranscriptionModel',
        'Live transcription model',
        'Used for microphone dictation and live voice transcripts.',
        DEFAULT_MODELS.liveTranscription,
        MODEL_CHOICES.liveTranscription,
      ),
      modelSetting(
        'fileTranscriptionModel',
        'File transcription model',
        'Used for recordings and chat dictation when live transcription is unavailable.',
        defaultFileTranscriptionModel(options.baseURL),
        MODEL_CHOICES.fileTranscription,
      ),
      modelSetting(
        'voice',
        'Voice',
        'The voice used for spoken Agent responses.',
        DEFAULT_VOICE,
        VOICE_CHOICES,
      ),
      {
        key: 'api',
        label: 'OpenAI API endpoint',
        description: 'The OpenAI-compatible API endpoint used on this device.',
        defaultValue: openAIEndpoint(options.baseURL),
        parse: apiEndpoint,
      },
    ],
  };
}

export const providerSettings = createOpenAISettings();

/** Browser storage is optional; the installed defaults remain available when it is blocked. */
export function createOpenAIPreferences(
  definition = providerSettings,
  options: { storage?: Storage } = {},
) {
  return createSettings(definition, {
    storage: options.storage ?? deviceSettingsStorage(),
  });
}

export function selectedOpenAIModel(defaultModel: string = DEFAULT_MODELS.llm) {
  const preferences = createOpenAIPreferences(createOpenAISettings({ defaultModel }));
  return openAIOptions(preferences.values()).models.llm;
}

export function openAIOptions(values: Readonly<Record<string, unknown>>) {
  const text = (key: string, fallback: string) =>
    typeof values[key] === 'string' && values[key].trim() ? values[key].trim() : fallback;
  return {
    baseURL: text('api', openAIEndpoint()),
    models: {
      llm: text('model', DEFAULT_MODELS.llm),
      voice: text('voiceModel', DEFAULT_MODELS.voice),
      liveTranscription: text('liveTranscriptionModel', DEFAULT_MODELS.liveTranscription),
      fileTranscription: text('fileTranscriptionModel', DEFAULT_MODELS.fileTranscription),
    },
    voice: text('voice', DEFAULT_VOICE),
  };
}

/** The Responses adapter drops sampling controls for these reasoning families. Custom
 * compatible model IDs remain tunable; their server determines parameter support. */
export function supportsOpenAISampling(model: string): boolean {
  return !(/^o\d+(?:-|$)/.test(model) || /^gpt-(?:[5-9]|[1-9]\d)(?:\.|-|$)/.test(model));
}

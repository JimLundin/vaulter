import {
  createSettings,
  deviceSettingsStorage,
  type SettingDefinition,
  type SettingsDefinition,
} from '../../settings.ts';
import { DEFAULT_MODELS, DEFAULT_VOICE, openAIEndpoint } from './defaults.ts';

// Keep the suggested models specific to the API each capability uses. Compatible endpoints may
// expose additional model IDs, so these choices remain suggestions rather than validation rules.
// https://developers.openai.com/api/docs/models
const MODEL_CHOICES = {
  llm: ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'],
  voice: ['gpt-realtime-2.1', 'gpt-realtime-2.1-mini'],
  liveTranscription: ['gpt-live-transcribe', 'gpt-realtime-whisper'],
  fileTranscription: ['gpt-transcribe', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'],
  embeddings: ['text-embedding-3-small', 'text-embedding-3-large'],
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
        clearable: true,
      },
      modelSetting(
        'model',
        'Model',
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
        'Used when transcribing audio recordings.',
        DEFAULT_MODELS.fileTranscription,
        MODEL_CHOICES.fileTranscription,
      ),
      modelSetting(
        'embeddingsModel',
        'Embedding model',
        'Used when producing text embeddings.',
        DEFAULT_MODELS.embeddings,
        MODEL_CHOICES.embeddings,
      ),
      modelSetting(
        'voice',
        'Voice',
        'The voice used for spoken Agent responses.',
        DEFAULT_VOICE,
        VOICE_CHOICES,
      ),
      {
        key: 'embeddingDimensions',
        label: 'Embedding dimensions',
        description: 'A positive integer. Leave blank for the embedding model default.',
        kind: 'number',
        parse: (value) => {
          if (!value.trim()) return;
          const dimensions = Number(value);
          if (!Number.isSafeInteger(dimensions) || dimensions < 1)
            throw new Error('Embedding dimensions must be a positive integer.');
          return dimensions;
        },
      },
      {
        key: 'api',
        label: 'OpenAI API endpoint',
        description: 'The API endpoint configured for this installation.',
        kind: 'readonly',
        defaultValue: openAIEndpoint(options.baseURL),
      },
    ],
  };
}

export const providerSettings = createOpenAISettings();
export const LEGACY_MODEL_KEY = 'vault.agent.model';

/** Preserve the previous device model choice without making browser storage a startup requirement. */
export function createOpenAIPreferences(
  definition = providerSettings,
  options: { storage?: Storage } = {},
) {
  const storage = options.storage ?? deviceSettingsStorage();
  let legacyModel: string | null = null;
  try {
    legacyModel = storage?.getItem(LEGACY_MODEL_KEY) ?? null;
  } catch {
    // The installed defaults remain available when preferences cannot be read.
  }
  const preferences = createSettings(definition, {
    storage,
    initial: legacyModel?.trim() ? { model: legacyModel.trim() } : undefined,
  });
  if (legacyModel !== null && storage) {
    try {
      preferences.set('model', preferences.snapshot().model);
      storage.removeItem(LEGACY_MODEL_KEY);
    } catch {
      // Retain the old choice until its replacement has been saved successfully.
    }
  }
  return preferences;
}

export function selectedOpenAIModel(defaultModel: string = DEFAULT_MODELS.llm) {
  const preferences = createOpenAIPreferences(createOpenAISettings({ defaultModel }));
  return openAIOptions(preferences.values()).models.llm;
}

export function openAIOptions(values: Readonly<Record<string, unknown>>) {
  const text = (key: string, fallback: string) =>
    typeof values[key] === 'string' && values[key].trim() ? values[key].trim() : fallback;
  const dimensions = values.embeddingDimensions;
  if (
    dimensions !== undefined &&
    dimensions !== '' &&
    (typeof dimensions !== 'number' || !Number.isSafeInteger(dimensions) || dimensions < 1)
  )
    throw new Error('Embedding dimensions must be a positive integer.');
  return {
    models: {
      llm: text('model', DEFAULT_MODELS.llm),
      voice: text('voiceModel', DEFAULT_MODELS.voice),
      liveTranscription: text('liveTranscriptionModel', DEFAULT_MODELS.liveTranscription),
      fileTranscription: text('fileTranscriptionModel', DEFAULT_MODELS.fileTranscription),
      embeddings: text('embeddingsModel', DEFAULT_MODELS.embeddings),
    },
    voice: text('voice', DEFAULT_VOICE),
    ...(typeof dimensions === 'number' ? { embeddingDimensions: dimensions } : {}),
  };
}

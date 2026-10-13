import {
  createSettings,
  deviceSettingsStorage,
  type SettingDefinition,
  type SettingsDefinition,
} from '../../settings.ts';
import { DEFAULT_MODELS, DEFAULT_VOICE, openAIEndpoint } from './defaults.ts';

function modelSetting(
  key: string,
  label: string,
  description: string,
  defaultValue: string,
): SettingDefinition {
  return {
    key,
    label,
    description,
    defaultValue,
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
      ),
      modelSetting(
        'voiceModel',
        'Voice model',
        'Used for spoken Agent responses.',
        DEFAULT_MODELS.voice,
      ),
      modelSetting(
        'liveTranscriptionModel',
        'Live transcription model',
        'Used for microphone dictation and live voice transcripts.',
        DEFAULT_MODELS.liveTranscription,
      ),
      modelSetting(
        'fileTranscriptionModel',
        'File transcription model',
        'Used when transcribing audio recordings.',
        DEFAULT_MODELS.fileTranscription,
      ),
      modelSetting(
        'embeddingsModel',
        'Embedding model',
        'Used when producing text embeddings.',
        DEFAULT_MODELS.embeddings,
      ),
      modelSetting('voice', 'Voice', 'The voice used for spoken Agent responses.', DEFAULT_VOICE),
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

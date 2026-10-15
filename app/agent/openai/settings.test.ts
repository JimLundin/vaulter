// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { generateText } from 'ai';
import { createSettings } from '../../settings/store.ts';
import { createOpenAICapabilities } from './index.ts';
import { media } from './media.test-support.ts';
import {
  createOpenAISettings,
  createOpenAIPreferences,
  providerSettings,
  openAIOptions,
  LEGACY_MODEL_KEY,
  selectedOpenAIModel,
} from './settings.ts';
import { DEFAULT_MODELS, DEFAULT_VOICE } from './defaults.ts';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

test('legacy model preferences migrate once to provider storage and reset to the installation default', () => {
  localStorage.setItem(LEGACY_MODEL_KEY, ' legacy-model ');
  const definition = createOpenAISettings({ defaultModel: 'installed-model' });
  const preferences = createOpenAIPreferences(definition);
  expect(openAIOptions(preferences.values()).models.llm).toBe('legacy-model');
  expect(JSON.parse(localStorage.getItem('vaulter.settings.openai')!)).toEqual({
    model: 'legacy-model',
  });
  expect(localStorage.getItem(LEGACY_MODEL_KEY)).toBeNull();
  preferences.reset();
  expect(selectedOpenAIModel('installed-model')).toBe('installed-model');
});

test('existing provider preferences take precedence over a legacy model choice', () => {
  localStorage.setItem(LEGACY_MODEL_KEY, 'legacy-model');
  localStorage.setItem(
    'vaulter.settings.openai',
    JSON.stringify({ model: 'provider-model', voice: 'cedar' }),
  );
  const preferences = createOpenAIPreferences();
  expect(openAIOptions(preferences.values())).toMatchObject({
    models: { llm: 'provider-model' },
    voice: 'cedar',
  });
  expect(localStorage.getItem(LEGACY_MODEL_KEY)).toBeNull();
  expect(JSON.parse(localStorage.getItem('vaulter.settings.openai')!)).toEqual({
    model: 'provider-model',
    voice: 'cedar',
  });
});

test('provider migration respects an explicitly supplied storage area', () => {
  localStorage.setItem(LEGACY_MODEL_KEY, 'browser-model');
  sessionStorage.setItem(LEGACY_MODEL_KEY, 'session-model');
  const preferences = createOpenAIPreferences(providerSettings, { storage: sessionStorage });
  expect(openAIOptions(preferences.values()).models.llm).toBe('session-model');
  expect(sessionStorage.getItem(LEGACY_MODEL_KEY)).toBeNull();
  expect(localStorage.getItem(LEGACY_MODEL_KEY)).toBe('browser-model');
  expect(localStorage.getItem('vaulter.settings.openai')).toBeNull();
});

test('failed legacy migration retains the old choice until provider preferences can be saved', () => {
  localStorage.setItem(LEGACY_MODEL_KEY, 'legacy-model');
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full');
  });
  const preferences = createOpenAIPreferences();
  const unsubscribe = preferences.subscribe(vi.fn());
  expect(openAIOptions(preferences.values()).models.llm).toBe('legacy-model');
  expect(localStorage.getItem(LEGACY_MODEL_KEY)).toBe('legacy-model');
  expect(localStorage.getItem('vaulter.settings.openai')).toBeNull();
  unsubscribe();
  write.mockRestore();
  expect(openAIOptions(createOpenAIPreferences().values()).models.llm).toBe('legacy-model');
  expect(localStorage.getItem(LEGACY_MODEL_KEY)).toBeNull();
});

test('OpenAI preference initialization tolerates blocked browser storage', () => {
  const access = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage disabled', 'SecurityError');
  });
  const definition = createOpenAISettings({ defaultModel: 'preview-model', baseURL: '' });
  const preferences = createOpenAIPreferences(definition);
  expect(openAIOptions(preferences.values()).models.llm).toBe('preview-model');
  expect(preferences.snapshot().api).toBe('https://api.openai.com/v1');
  preferences.set('model', 'session-model');
  expect(openAIOptions(preferences.values()).models.llm).toBe('session-model');
  expect(selectedOpenAIModel('installed-model')).toBe('installed-model');
  access.mockRestore();
});

test('OpenAI settings expose installed defaults and exclude credentials from preferences', () => {
  const definition = createOpenAISettings({
    defaultModel: 'preview-model',
    baseURL: 'https://fixture.example/',
  });
  const preferences = createSettings(definition);
  expect(preferences.snapshot().api).toBe('https://fixture.example/v1');
  expect(openAIOptions(preferences.values())).toEqual({
    models: { ...DEFAULT_MODELS, llm: 'preview-model' },
    voice: DEFAULT_VOICE,
  });
  expect(preferences.snapshot()).not.toHaveProperty('openai');
  expect(() => preferences.set('openai', 'a-secret')).toThrow();
  expect(() => preferences.set('api', 'https://other.example')).toThrow();
  preferences.set('voice', 'cedar');
  expect(localStorage.getItem('vaulter.settings.openai')).not.toContain('a-secret');
  expect(localStorage.getItem('vaulter.settings.openai')).not.toContain('fixture.example');
});

test('OpenAI model choices match each capability and retain the installation model', () => {
  const definition = createOpenAISettings({ defaultModel: 'installed-model' });
  const choices = (key: string) =>
    definition.fields.find((field) => field.key === key)?.choices?.map((choice) => choice.value);
  expect(choices('model')?.[0]).toBe('installed-model');
  for (const field of definition.fields.filter((candidate) => candidate.choices)) {
    const values = field.choices!.map((choice) => choice.value);
    expect(values).toContain(field.defaultValue);
    expect(new Set(values).size).toBe(values.length);
  }
  expect(choices('model')).toContain(DEFAULT_MODELS.llm);
  expect(choices('model')).not.toContain(DEFAULT_MODELS.voice);
  expect(choices('voiceModel')).toContain('gpt-realtime-2.1-mini');
  expect(choices('voiceModel')).not.toContain(DEFAULT_MODELS.llm);
  expect(choices('liveTranscriptionModel')).toContain('gpt-realtime-whisper');
  // Committed-turn GPT-Transcribe requires WebSocket, while dictation uses WebRTC.
  expect(choices('liveTranscriptionModel')).not.toContain(DEFAULT_MODELS.fileTranscription);
  expect(choices('fileTranscriptionModel')).toContain('gpt-4o-mini-transcribe');
  expect(choices('fileTranscriptionModel')).not.toContain(DEFAULT_MODELS.liveTranscription);
  expect(choices('embeddingsModel')).toContain('text-embedding-3-large');
  expect(choices('embeddingsModel')).not.toContain(DEFAULT_MODELS.llm);
  expect(choices('voice')).toContain('cedar');
  expect(choices('voice')).not.toContain(DEFAULT_MODELS.voice);
  const defaultChoices = providerSettings.fields.find((field) => field.key === 'model')?.choices;
  expect(defaultChoices?.filter((choice) => choice.value === DEFAULT_MODELS.llm)).toHaveLength(1);
});

test('Foundry defaults to the supported recorded-audio model and retains explicit model choices', () => {
  const baseURL =
    'https://fictional.palantirfoundry.com/language-model-service/api/proxy/openai/v1';
  const definition = createOpenAISettings({ baseURL });
  const preferences = createSettings(definition);
  expect(openAIOptions(preferences.values()).models.fileTranscription).toBe('gpt-4o-transcribe');
  expect(createOpenAICapabilities({ apiKey: 'fictional', baseURL }).models.fileTranscription).toBe(
    'gpt-4o-transcribe',
  );
  preferences.set('fileTranscriptionModel', 'custom-file-model');
  expect(openAIOptions(createOpenAIPreferences(definition).values()).models.fileTranscription).toBe(
    'custom-file-model',
  );
});

test('dropdown suggestions preserve saved custom model and voice IDs across reopening and reset', () => {
  const definition = createOpenAISettings({
    defaultModel: 'installed-model',
    baseURL: 'https://compatible.example',
  });
  const preferences = createSettings(definition);
  const custom = {
    model: 'custom-text',
    voiceModel: 'custom-realtime',
    liveTranscriptionModel: 'custom-live-transcription',
    fileTranscriptionModel: 'custom-file-transcription',
    embeddingsModel: 'custom-embeddings',
    voice: 'custom-voice',
  };
  for (const [key, value] of Object.entries(custom)) {
    expect(definition.fields.find((field) => field.key === key)?.allowCustom).toBe(true);
    preferences.set(key, value);
  }
  const reopened = createOpenAIPreferences(definition);
  expect(openAIOptions(reopened.values())).toEqual({
    models: {
      llm: custom.model,
      voice: custom.voiceModel,
      liveTranscription: custom.liveTranscriptionModel,
      fileTranscription: custom.fileTranscriptionModel,
      embeddings: custom.embeddingsModel,
    },
    voice: custom.voice,
  });
  reopened.reset();
  expect(openAIOptions(reopened.values())).toEqual({
    models: { ...DEFAULT_MODELS, llm: 'installed-model' },
    voice: DEFAULT_VOICE,
  });
});

test.each(['0', '-1', '1.5', 'Infinity', '9007199254740992'])(
  'rejects invalid embedding dimensions %s',
  (value) => {
    const preferences = createSettings(providerSettings);
    expect(() => preferences.set('embeddingDimensions', value)).toThrow('positive integer');
  },
);

test('saved models and dimensions configure actual text, audio and embedding requests', async () => {
  const preferences = createSettings(providerSettings);
  preferences.set('model', 'configured-text');
  preferences.set('fileTranscriptionModel', 'configured-file');
  preferences.set('embeddingsModel', 'configured-embedding');
  preferences.set('embeddingDimensions', '2');
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation((url) => {
    if (String(url).endsWith('/audio/transcriptions'))
      return Promise.resolve(Response.json({ text: 'Transcript' }));
    if (String(url).endsWith('/embeddings'))
      return Promise.resolve(
        Response.json({
          model: 'configured-embedding',
          data: [{ index: 0, embedding: [1, 2] }],
          usage: { prompt_tokens: 1, total_tokens: 1 },
        }),
      );
    return Promise.resolve(
      Response.json({
        id: 'response',
        object: 'response',
        created_at: 1,
        model: 'configured-text',
        status: 'completed',
        output: [
          {
            type: 'message',
            id: 'message',
            status: 'completed',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
          },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }),
    );
  });
  const reopened = createSettings(providerSettings);
  const capabilities = createOpenAICapabilities({
    apiKey: 'fixture-secret',
    fetch,
    ...openAIOptions(reopened.values()),
  });
  expect((await generateText({ model: await capabilities.model(), prompt: 'Hello' })).text).toBe(
    'Hello',
  );
  expect((await capabilities.transcribe(new File(['audio'], 'recording.webm'))).model).toBe(
    'configured-file',
  );
  expect((await capabilities.embed(['Hello'])).dimensions).toBe(2);
  expect(JSON.parse(fetch.mock.calls[0]![1]!.body as string)).toMatchObject({
    model: 'configured-text',
    store: false,
  });
  expect((fetch.mock.calls[1]![1]!.body as FormData).get('model')).toBe('configured-file');
  expect(JSON.parse(fetch.mock.calls[2]![1]!.body as string)).toMatchObject({
    model: 'configured-embedding',
    dimensions: 2,
  });
  reopened.set('embeddingDimensions', '');
  expect(openAIOptions(reopened.values())).not.toHaveProperty('embeddingDimensions');
});

test('voice and live transcription settings reach their separate realtime sessions', async () => {
  const preferences = createSettings(providerSettings);
  preferences.set('voiceModel', 'configured-voice');
  preferences.set('liveTranscriptionModel', 'configured-transcription');
  preferences.set('voice', 'cedar');
  const harness = media();
  const capabilities = createOpenAICapabilities({
    apiKey: 'fixture-secret',
    fetch: harness.fetch,
    ...openAIOptions(preferences.values()),
  });
  const voice = await capabilities.liveVoice({
    instructions: 'Help with the vault.',
    tools: {},
    history: [],
    signal: new AbortController().signal,
    events: { transcript: vi.fn(), audio: vi.fn(), error: vi.fn() },
    expire: vi.fn(),
    acceptUser: vi.fn(),
    execute: vi.fn(),
    recordResponse: vi.fn(),
  });
  expect(JSON.parse(harness.fetch.mock.calls[0]![1]!.body as string).session).toMatchObject({
    model: 'configured-voice',
    audio: {
      input: { transcription: { model: 'configured-transcription' } },
      output: { voice: 'cedar' },
    },
  });
  await voice.close();
  const dictationMedia = media();
  const dictation = createOpenAICapabilities({
    apiKey: 'fixture-secret',
    fetch: dictationMedia.fetch,
    ...openAIOptions(preferences.values()),
  });
  const capture = await dictation.liveTranscription(
    { text: vi.fn(), error: vi.fn() },
    new AbortController().signal,
  );
  expect(JSON.parse(dictationMedia.fetch.mock.calls[0]![1]!.body as string).session).toMatchObject({
    type: 'transcription',
    audio: { input: { transcription: { model: 'configured-transcription' } } },
  });
  capture.close();
});

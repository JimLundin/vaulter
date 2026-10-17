import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import type { AgentBackendOptions } from '@/agent/runtime.ts';
import { createVoiceAgent, type VoiceAgentOptions } from '@/agent/voice-runtime.ts';
import { createAgentBackend } from '@/agent/runtime.ts';
import { openAITranscription } from './live-transcription.ts';
import { openAIDictation } from './dictation.ts';
import { openAIFileTranscription } from './file-transcription.ts';
import { openAILiveVoice } from './live-voice.ts';
import { openAIHttp, type OpenAIConnectionOptions } from './http.ts';
import { DEFAULT_MODELS, defaultFileTranscriptionModel } from './defaults.ts';

/** One session-scoped provider module. Secrets are captured here and never enter node records. */
export function createOpenAICapabilities(
  options: OpenAIConnectionOptions & {
    readonly models?: {
      readonly llm?: string;
      readonly voice?: string;
      readonly liveTranscription?: string;
      readonly fileTranscription?: string;
    };
    readonly voice?: string;
  },
) {
  const http = openAIHttp(options);
  const provider = createOpenAI({ apiKey: options.apiKey, baseURL: http.api, fetch: http.fetch });
  const models = Object.freeze({
    llm: options.models?.llm ?? DEFAULT_MODELS.llm,
    voice: options.models?.voice ?? DEFAULT_MODELS.voice,
    liveTranscription: options.models?.liveTranscription ?? DEFAULT_MODELS.liveTranscription,
    fileTranscription: options.models?.fileTranscription ?? defaultFileTranscriptionModel(http.api),
  });
  const model = async (name = models.llm) =>
    wrapLanguageModel({
      model: provider.responses(name),
      middleware: {
        specificationVersion: 'v4',
        transformParams: ({ params }) =>
          Promise.resolve({
            ...params,
            providerOptions: {
              ...params.providerOptions,
              openai: { ...params.providerOptions?.openai, store: false },
            },
          }),
      },
    });
  const liveVoice = openAILiveVoice({
    ...options,
    model: models.voice,
    voice: options.voice,
    transcriptionModel: models.liveTranscription,
  });
  const liveTranscription = openAITranscription(options.apiKey, http.api, {
    model: models.liveTranscription,
    fetch: http.fetch,
  });
  const transcribe = openAIFileTranscription({ ...options, model: models.fileTranscription });
  return {
    provider: 'openai' as const,
    models,
    model,
    agent: (configuration: Omit<AgentBackendOptions, 'execution' | 'model'>) =>
      createAgentBackend({ ...configuration, model }),
    liveVoice,
    voiceAgent: (
      configuration: Omit<
        VoiceAgentOptions,
        'provider' | 'model' | 'transcriptionModel' | 'connect'
      >,
    ) =>
      createVoiceAgent({
        ...configuration,
        provider: 'openai',
        model: models.voice,
        transcriptionModel: models.liveTranscription,
        connect: liveVoice,
      }),
    liveTranscription,
    dictation: openAIDictation(liveTranscription, transcribe),
    transcribe,
  };
}

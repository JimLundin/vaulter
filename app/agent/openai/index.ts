import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import type { AgentBackendOptions } from '../runtime.ts';
import { createVoiceAgent, type VoiceAgentOptions } from '../voice-runtime.ts';
import { createAgentBackend } from '../runtime.ts';
import { openAITranscription } from './live-transcription.ts';
import { openAIEmbeddings } from './embeddings.ts';
import { openAIFileTranscription } from './file-transcription.ts';
import { openAILiveVoice } from './live-voice.ts';
import { openAIHttp, type OpenAIConnectionOptions } from './http.ts';

/** One session-scoped provider module. Secrets are captured here and never enter node records. */
export function createOpenAICapabilities(
  options: OpenAIConnectionOptions & {
    readonly models?: {
      readonly llm?: string;
      readonly voice?: string;
      readonly liveTranscription?: string;
      readonly fileTranscription?: string;
      readonly embeddings?: string;
    };
    readonly embeddingDimensions?: number;
    readonly voice?: string;
  },
) {
  const http = openAIHttp(options);
  const provider = createOpenAI({ apiKey: options.apiKey, baseURL: http.api, fetch: http.fetch });
  const models = Object.freeze({
    llm: options.models?.llm ?? 'gpt-6-astra',
    voice: options.models?.voice ?? 'gpt-realtime-2.1',
    liveTranscription: options.models?.liveTranscription ?? 'gpt-live-transcribe',
    fileTranscription: options.models?.fileTranscription ?? 'gpt-transcribe',
    embeddings: options.models?.embeddings ?? 'text-embedding-3-small',
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
    liveTranscription: openAITranscription(options.apiKey, http.api, {
      model: models.liveTranscription,
      fetch: http.fetch,
    }),
    transcribe: openAIFileTranscription({ ...options, model: models.fileTranscription }),
    embed: openAIEmbeddings({
      ...options,
      model: models.embeddings,
      dimensions: options.embeddingDimensions,
    }),
  };
}

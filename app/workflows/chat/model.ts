import type { LanguageModel } from 'ai';
import { DEFAULT_MODELS } from '../../agent/openai/defaults.ts';
import { LEGACY_MODEL_KEY, selectedOpenAIModel } from '../../agent/openai/settings.ts';

export const MODEL_KEY = LEGACY_MODEL_KEY;
export const DEFAULT_MODEL = DEFAULT_MODELS.llm;
export const model = selectedOpenAIModel;
export type ModelProvider = (name: string) => Promise<LanguageModel>;

export const openAIModel =
  (key: string, baseURL?: string): ModelProvider =>
  async (name) => {
    const { createOpenAICapabilities } = await import('../../agent/openai/index.ts');
    return createOpenAICapabilities({ apiKey: key, baseURL }).model(name);
  };

import type { LanguageModel } from 'ai';

export const MODEL_KEY = 'vault.agent.model';
export const DEFAULT_MODEL = 'gpt-6-astra';
export const model = () => localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
export type ModelProvider = (name: string) => Promise<LanguageModel>;

export const openAIModel =
  (key: string, baseURL?: string): ModelProvider =>
  async (name) => {
    const { createOpenAICapabilities } = await import('../../agent/openai/index.ts');
    return createOpenAICapabilities({ apiKey: key, baseURL }).model(name);
  };

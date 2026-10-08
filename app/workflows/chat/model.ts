import type { LanguageModel } from 'ai';

export const MODEL_KEY = 'vault.agent.model';
export const DEFAULT_MODEL = 'gpt-6-astra';
export const model = () => localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;
export type ModelProvider = (name: string) => Promise<LanguageModel>;

export const openAIModel =
  (key: string, baseURL?: string): ModelProvider =>
  async (name) => {
    const { createOpenAI } = await import('@ai-sdk/openai');
    return createOpenAI({ apiKey: key, baseURL })(name);
  };

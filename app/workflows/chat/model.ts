import type { LanguageModel } from 'ai';
import { selectedOpenAIModel } from '@/agent/openai/settings.ts';

export const model = selectedOpenAIModel;
export type ModelProvider = (name: string) => Promise<LanguageModel>;

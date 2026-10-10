import type { LanguageModel } from 'ai';

/** Provider mechanics live behind the existing AI SDK model seam. */
export type LanguageModelProvider = (model: string) => Promise<LanguageModel>;

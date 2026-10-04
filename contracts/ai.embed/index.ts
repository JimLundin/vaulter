// Text to vectors, for search by meaning. Vectors from different models don't compare: keep the model
// with them.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const EmbedRequest = z.object({
  texts: z.array(z.string()).min(1).max(2048),
  model: z.string().optional(),
});
export type EmbedRequest = z.input<typeof EmbedRequest>;

export interface Embeddings {
  vectors: number[][];
  model: string;
  dimensions: number;
}

export interface EmbedV1 {
  embed: (req: EmbedRequest) => Promise<Embeddings>;
}

export const embed = defineContract<EmbedV1>({
  name: 'ai.embed',
  version: '1.0.0',
  inputs: { embed: z.tuple([EmbedRequest]) },
});

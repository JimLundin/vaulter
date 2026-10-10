import type { EmbeddingProvider } from '../providers.ts';
import { z } from 'zod';
import { frozen } from '../../vault/nodes/json.ts';
import { openAIHttp, type OpenAIConnectionOptions } from './http.ts';

const resultSchema = z.object({
  model: z.string().min(1),
  data: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      embedding: z.array(z.number().finite()).min(1),
    }),
  ),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});
export function openAIEmbeddings(
  options: OpenAIConnectionOptions & { readonly model?: string; readonly dimensions?: number },
): EmbeddingProvider {
  const http = openAIHttp(options);
  const model = options.model ?? 'text-embedding-3-small';
  const dimensions =
    options.dimensions ??
    (model === 'text-embedding-3-small'
      ? 1536
      : model === 'text-embedding-3-large'
        ? 3072
        : undefined);
  if (dimensions !== undefined && (!Number.isSafeInteger(dimensions) || dimensions < 1))
    throw new Error('Embedding dimensions must be a positive integer');
  return async (texts, signal) => {
    signal?.throwIfAborted();
    if (!texts.length || texts.some((text) => !text.trim()))
      throw new Error('Embeddings require nonempty input text');
    const input = [...texts];
    const vectors: number[][] = [];
    let servedModel: string | undefined;
    let width = dimensions;
    let tokens = 0;
    for (let start = 0; start < input.length; start += 128) {
      const batch = input.slice(start, start + 128);
      // biome-ignore lint/performance/noAwaitInLoops: bound network concurrency and stop before subsequent batches on failure.
      const response = await http.post(
        'embeddings',
        JSON.stringify({
          model,
          input: batch,
          encoding_format: 'float',
          ...(options.dimensions ? { dimensions: options.dimensions } : {}),
        }),
        signal,
        'application/json',
      );
      const result = resultSchema.parse(await response.json());
      if (result.data.length !== batch.length || (servedModel && servedModel !== result.model))
        throw new Error('OpenAI returned inconsistent embedding results');
      servedModel = result.model;
      const seen = new Set<number>();
      for (const entry of result.data) {
        width ??= entry.embedding.length;
        if (
          entry.index >= batch.length ||
          seen.has(entry.index) ||
          entry.embedding.length !== width
        )
          throw new Error('OpenAI returned invalid embedding indices or dimensions');
        seen.add(entry.index);
        vectors[start + entry.index] = entry.embedding;
      }
      tokens += result.usage.total_tokens;
    }
    signal?.throwIfAborted();
    return frozen({ model: servedModel!, dimensions: width!, vectors, tokens });
  };
}

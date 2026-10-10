import { z } from 'zod';

export interface OpenAIConnectionOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetch?: typeof fetch;
}
export function openAIHttp(options: OpenAIConnectionOptions) {
  if (!options.apiKey.trim()) throw new Error('An unlocked OpenAI key is required');
  const root = (options.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '');
  const api = root.endsWith('/v1') ? root : `${root}/v1`;
  const request = options.fetch ?? globalThis.fetch.bind(globalThis);
  return {
    api,
    fetch: request,
    post: async (
      path: string,
      body: BodyInit,
      signal?: AbortSignal,
      contentType?: string,
      credential = options.apiKey,
    ) => {
      signal?.throwIfAborted();
      const response = await request(`${api}/${path}`, {
        method: 'POST',
        body,
        headers: {
          Authorization: `Bearer ${credential}`,
          ...(contentType ? { 'Content-Type': contentType } : {}),
        },
        signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(30_000)]),
      });
      if (!response.ok) throw new Error(`OpenAI ${path} request failed (${response.status})`);
      return response;
    },
  };
}
export const clientSecretSchema = z.object({ value: z.string().min(1) });

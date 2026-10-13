import { z } from 'zod';
import { openAIEndpoint } from './defaults.ts';

export interface OpenAIConnectionOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly requestError?: (path: string, status: number) => string;
}

export class OpenAIRequestError extends Error {
  readonly path: string;
  readonly status: number;

  constructor(path: string, status: number, message: string) {
    super(message);
    this.name = 'OpenAIRequestError';
    this.path = path;
    this.status = status;
  }
}

export function openAIHttp(options: OpenAIConnectionOptions) {
  if (!options.apiKey.trim()) throw new Error('An unlocked OpenAI key is required');
  const api = openAIEndpoint(options.baseURL);
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
        signal: AbortSignal.any([
          ...(signal ? [signal] : []),
          AbortSignal.timeout(options.timeoutMs ?? 30_000),
        ]),
      });
      if (!response.ok)
        throw new OpenAIRequestError(
          path,
          response.status,
          options.requestError?.(path, response.status) ??
            `OpenAI ${path} request failed (${response.status})`,
        );
      return response;
    },
  };
}
export const clientSecretSchema = z.object({ value: z.string().min(1) });

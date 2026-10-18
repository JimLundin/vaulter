import { z } from 'zod';
import type { FileTranscriptionProvider } from '@/modules/agent/providers.ts';
import { defaultFileTranscriptionModel } from './defaults.ts';
import { type OpenAIConnectionOptions, openAIHttp } from './http.ts';

export function openAIFileTranscription(
  options: OpenAIConnectionOptions & { readonly model?: string },
): FileTranscriptionProvider {
  const http = openAIHttp(options);
  const model = options.model ?? defaultFileTranscriptionModel(http.api);
  return async (audio: File, signal?: AbortSignal) => {
    if (!audio.size || audio.size > 25 * 1024 * 1024)
      throw new Error('Transcription requires a recording between 1 byte and 25 MB');
    const body = new FormData();
    body.append('file', audio, audio.name);
    body.append('model', model);
    body.append('response_format', 'json');
    const response = await http.post('audio/transcriptions', body, signal);
    const result = z.object({ text: z.string() }).parse(await response.json());
    return { text: result.text, model, provider: 'openai' as const };
  };
}

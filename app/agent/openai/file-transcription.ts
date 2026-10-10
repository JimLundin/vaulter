import type { FileTranscriptionProvider } from '../providers.ts';
import { z } from 'zod';
import { openAIHttp, type OpenAIConnectionOptions } from './http.ts';

export function openAIFileTranscription(
  options: OpenAIConnectionOptions & { readonly model?: string },
): FileTranscriptionProvider {
  const http = openAIHttp(options);
  const model = options.model ?? 'gpt-transcribe';
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

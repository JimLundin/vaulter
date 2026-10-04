// Speech to text for recorded audio. Live transcription is ai.realtime.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const TranscribeRequest = z.object({
  audio: z.union([z.instanceof(Blob), z.instanceof(ArrayBuffer)]),
  /** audio/webm, audio/mp4, audio/wav… */
  mime: z.string().min(1),
  model: z.string().optional(),
  /** BCP 47, when known: "sv", "en". */
  language: z.string().optional(),
  /** Names and words to expect: people and places from the wiki. */
  prompt: z.string().max(4000).optional(),
});
export type TranscribeRequest = z.input<typeof TranscribeRequest>;

export interface Transcript {
  text: string;
  language?: string;
  seconds?: number;
}

export interface TranscribeV1 {
  transcribe: (req: TranscribeRequest) => Promise<Transcript>;
}

export const transcribe = defineContract<TranscribeV1>({
  name: 'ai.transcribe',
  version: '1.0.0',
  inputs: { transcribe: z.tuple([TranscribeRequest]) },
});

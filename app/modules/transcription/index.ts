// biome-ignore-all lint/performance/noBarrelFile: Capture lifetime and its transport contract have one owner.
export { createTranscription, useTranscription, useTranscript } from './capture.ts';
export type { Transcription, TranscriptionState } from './capture.ts';
export type {
  TranscriptionProvider,
  TranscriptionConnection,
  TranscriptionEvents,
} from './provider.ts';

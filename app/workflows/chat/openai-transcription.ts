// Compatibility export; provider transport is owned independently of Chat.
// biome-ignore lint/performance/noBarrelFile: preserve the established Chat transcription import.
export { openAITranscription, TRANSCRIPTION_MODEL } from '../../agent/openai/live-transcription.ts';

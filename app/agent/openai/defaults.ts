export const DEFAULT_MODELS = Object.freeze({
  llm: 'gpt-6-astra',
  voice: 'gpt-realtime-2.1',
  liveTranscription: 'gpt-live-transcribe',
  fileTranscription: 'gpt-transcribe',
  embeddings: 'text-embedding-3-small',
});
export const DEFAULT_VOICE = 'marin';
export const DEFAULT_OPENAI_API = 'https://api.openai.com/v1';

export function openAIEndpoint(baseURL = DEFAULT_OPENAI_API) {
  const root = (baseURL.trim() || DEFAULT_OPENAI_API).replace(/\/+$/, '');
  return root.endsWith('/v1') ? root : `${root}/v1`;
}

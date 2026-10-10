export interface TranscriptionConnection {
  finish: () => Promise<string>;
  close: () => void;
}
export interface TranscriptionEvents {
  text: (text: string) => void;
  error: (error: Error) => void;
}
export type TranscriptionProvider = (
  events: TranscriptionEvents,
  signal: AbortSignal,
) => Promise<TranscriptionConnection>;

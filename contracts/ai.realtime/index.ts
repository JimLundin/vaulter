// Live audio sessions. The provider mints a short-lived session key from the account's key (which only
// the kernel holds) and returns it with where to connect; the requirer (voice) connects itself, over
// WebRTC, and never sees the account's key (ARCHITECTURE.md, "Secrets").
import { defineContract } from '@pip/kernel';
import { z } from 'zod';

export const SessionRequest = z.object({
  /** Transcribing what is said, or a spoken conversation with Pip. */
  purpose: z.enum(['transcription', 'conversation']),
  model: z.string().optional(),
  instructions: z.string().max(8000).optional(),
  language: z.string().optional(),
  /** Names and words to expect. */
  prompt: z.string().max(4000).optional(),
});
export type SessionRequest = z.input<typeof SessionRequest>;

export interface Session {
  /** The short-lived key for this session only. */
  clientSecret: string;
  expiresAt: string;
  model: string;
  /** Where to send the WebRTC offer, with the key as a bearer token. */
  connect: { kind: 'webrtc'; url: string };
}

export interface RealtimeV1 {
  session: (req: SessionRequest) => Promise<Session>;
}

export const realtime = defineContract<RealtimeV1>({
  name: 'ai.realtime',
  version: '1.0.0',
  inputs: { session: z.tuple([SessionRequest]) },
});

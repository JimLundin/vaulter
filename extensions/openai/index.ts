// OpenAI: provides ai.chat (the Responses API) and ai.realtime. The account's
// key is a secret the secrets extension holds and attaches (net@1); this extension never sees it. A realtime session gets a
// short-lived key minted here, which is all the voice extension receives.
import { defineExtension } from '@vaulter/kernel';
import { chat } from '@contracts/ai.chat';
import { net } from '@contracts/net';
import { realtime, SessionRequest } from '@contracts/ai.realtime';
import { fromResponse, readStream, toResponsesBody } from './responses.ts';

const API = 'https://api.openai.com/v1';

/** Defaults, when a request names no model. */
export const MODELS = {
  chat: 'gpt-6.1-sol',
  realtime: 'gpt-realtime-2.1',
  liveTranscribe: 'gpt-live-transcribe',
};

export default defineExtension({
  id: 'openai',
  version: '1.0.0',
  provides: { chat, realtime },
  requires: { net },
  secrets: {
    key: { label: 'OpenAI API key, from a project with a spend limit', hosts: ['api.openai.com'] },
  },
  agentGuide:
    'The language and live speech models. Other extensions use it; Vaulter rarely calls it directly.',
  setup({ net }) {
    const call = async (path: string, init: { json?: unknown } = {}) => {
      const r = await net.fetch(`${API}${path}`, {
        method: init.json === undefined ? 'GET' : 'POST',
        headers: init.json === undefined ? {} : { 'Content-Type': 'application/json' },
        body: init.json === undefined ? undefined : JSON.stringify(init.json),
        secret: 'key',
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(`OpenAI ${r.status}: ${err?.error?.message ?? r.statusText}`);
      }
      return r;
    };

    return {
      chat: {
        complete: async (req) =>
          fromResponse(
            await (
              await call('/responses', { json: toResponsesBody(req, MODELS.chat, false) })
            ).json(),
          ),
        async stream(req, onDelta) {
          const r = await call('/responses', { json: toResponsesBody(req, MODELS.chat, true) });
          if (!r.body) throw new Error('OpenAI: no stream');
          return readStream(r.body, onDelta);
        },
        models: async () =>
          ((await (await call('/models')).json()) as { data: { id: string }[] }).data
            .map((m) => m.id)
            .sort(),
      },

      realtime: {
        async session(raw) {
          const req = SessionRequest.parse(raw);
          const transcription = {
            model: MODELS.liveTranscribe,
            ...(req.language ? { languages: [req.language] } : {}),
            ...(req.prompt ? { prompt: req.prompt } : {}),
          };
          const session =
            req.purpose === 'transcription'
              ? {
                  type: 'transcription',
                  audio: {
                    input: {
                      transcription: {
                        ...transcription,
                        model: req.model ?? MODELS.liveTranscribe,
                      },
                    },
                  },
                }
              : {
                  type: 'realtime',
                  model: req.model ?? MODELS.realtime,
                  ...(req.instructions ? { instructions: req.instructions } : {}),
                  audio: { input: { transcription } },
                };
          const out = (await (
            await call('/realtime/client_secrets', {
              json: { expires_after: { anchor: 'created_at', seconds: 600 }, session },
            })
          ).json()) as { value: string; expires_at: number; session?: { model?: string } };
          return {
            clientSecret: out.value,
            expiresAt: new Date(out.expires_at * 1000).toISOString(),
            model:
              out.session?.model ??
              (req.purpose === 'transcription'
                ? transcription.model
                : (req.model ?? MODELS.realtime)),
            connect: { kind: 'webrtc', url: `${API}/realtime/calls` },
          };
        },
      },
    };
  },
});

// OpenAI: provides ai.chat (the Responses API), ai.transcribe, ai.realtime and ai.embed. The account's
// key is a secret the kernel holds and attaches; this extension never sees it. A realtime session gets a
// short-lived key minted here, which is all the voice extension receives.
import { defineExtension } from '@pip/kernel';
import { chat } from '@contracts/ai.chat';
import { embed } from '@contracts/ai.embed';
import { realtime, SessionRequest } from '@contracts/ai.realtime';
import { TranscribeRequest, transcribe } from '@contracts/ai.transcribe';
import { fromResponse, readStream, toResponsesBody } from './responses.ts';

const API = 'https://api.openai.com/v1';

/** Defaults, when a request names no model. */
export const MODELS = {
  chat: 'gpt-6.1-sol',
  transcribe: 'gpt-transcribe',
  realtime: 'gpt-realtime-2.1',
  liveTranscribe: 'gpt-live-transcribe',
  embed: 'text-embedding-3-small',
};

const extOf = (mime: string) =>
  ({
    'audio/webm': 'webm',
    'audio/mp4': 'mp4',
    'audio/mpeg': 'mp3',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
  })[mime.split(';')[0]] ?? 'webm';

/** A multipart/form-data body by hand: FormData can't cross from a sandbox to the kernel. */
function multipart(
  fields: Record<string, string | undefined>,
  file: { name: string; mime: string; bytes: Uint8Array },
) {
  const boundary = `pip-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  for (const [k, v] of Object.entries(fields))
    if (v !== undefined)
      parts.push(
        enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`),
      );
  parts.push(
    enc.encode(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
    file.bytes,
    enc.encode(`\r\n--${boundary}--\r\n`),
  );
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    body.set(p, at);
    at += p.length;
  }
  return { body, type: `multipart/form-data; boundary=${boundary}` };
}

export default defineExtension({
  id: 'openai',
  version: '1.0.0',
  provides: { chat, transcribe, realtime, embed },
  secrets: {
    key: { label: 'OpenAI API key, from a project with a spend limit', hosts: ['api.openai.com'] },
  },
  agentGuide:
    'The language, speech and embedding models. Other extensions use it; Pip rarely calls it directly.',
  setup(_, kernel) {
    const call = async (
      path: string,
      init: { json?: unknown; body?: Uint8Array; type?: string; method?: string } = {},
    ) => {
      const r = await kernel.fetch(`${API}${path}`, {
        method: init.method ?? (init.json !== undefined || init.body ? 'POST' : 'GET'),
        headers:
          init.json !== undefined
            ? { 'Content-Type': 'application/json' }
            : init.type
              ? { 'Content-Type': init.type }
              : {},
        body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
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

      transcribe: {
        async transcribe(raw) {
          const req = TranscribeRequest.parse(raw);
          const bytes = new Uint8Array(
            req.audio instanceof Blob ? await req.audio.arrayBuffer() : req.audio,
          );
          const { body, type } = multipart(
            {
              model: req.model ?? MODELS.transcribe,
              language: req.language,
              prompt: req.prompt,
              response_format: 'json',
            },
            { name: `audio.${extOf(req.mime)}`, mime: req.mime, bytes },
          );
          const out = (await (await call('/audio/transcriptions', { body, type })).json()) as {
            text: string;
            language?: string;
            duration?: number;
          };
          return { text: out.text, language: out.language, seconds: out.duration };
        },
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

      embed: {
        async embed(req) {
          const out = (await (
            await call('/embeddings', {
              json: {
                input: req.texts,
                model: req.model ?? MODELS.embed,
                encoding_format: 'float',
              },
            })
          ).json()) as { model: string; data: { index: number; embedding: number[] }[] };
          const vectors = [...out.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
          return { vectors, model: out.model, dimensions: vectors[0]?.length ?? 0 };
        },
      },
    };
  },
});

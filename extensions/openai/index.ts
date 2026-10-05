// OpenAI: the language model (#chat), over the Responses API. The account's key is a secret the secrets
// extension holds and attaches (#net); this extension never sees it.

import type { ChatV1 } from '#contracts/ai.chat';
import { netFor } from '#net';
import { about } from './about.ts';
import { fromResponse, toResponsesBody } from './responses.ts';

const API = 'https://api.openai.com/v1';

/** The model it asks. */
const MODEL = 'gpt-6.1-sol';

const net = netFor('openai', about);

const post = async (path: string, json: unknown) => {
  const r = await net.fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(json),
    secret: 'key',
  });
  if (!r.ok) {
    const err = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`OpenAI ${r.status}: ${err?.error?.message ?? r.statusText}`);
  }
  return r;
};

export const chat: ChatV1 = {
  complete: async (req) =>
    fromResponse(await (await post('/responses', toResponsesBody(req, MODEL))).json()),
};

// OpenAI: provides ai.chat, over the Responses API. The account's key is a secret the secrets
// extension holds and attaches (net@1); this extension never sees it.

import { chat } from '#contracts/ai.chat';
import { net } from '#contracts/net';
import { defineExtension } from '#kernel';
import { fromResponse, toResponsesBody } from './responses.ts';

const API = 'https://api.openai.com/v1';

/** The model it asks. */
export const MODEL = 'gpt-6.1-sol';

export default defineExtension({
  id: 'openai',
  version: '1.0.0',
  provides: { chat },
  requires: { net },
  secrets: {
    key: { label: 'OpenAI API key, from a project with a spend limit', hosts: ['api.openai.com'] },
  },
  agentGuide: 'The language model. Other extensions use it; Vaulter rarely calls it directly.',
  setup({ net }) {
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

    return {
      chat: {
        complete: async (req) =>
          fromResponse(await (await post('/responses', toResponsesBody(req, MODEL))).json()),
      },
    };
  },
});

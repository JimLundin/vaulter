// The conversation with the agent, for the session: outside any view, so it survives the panel closing and
// moving around the app, and a running turn keeps going meanwhile. `send` works with no view open; the
// panel's indicator, always on screen, keeps `chat.host` current. The model and the SDK load on the
// first send.
import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { ModelMessage, ToolSet } from 'ai';
import { search } from '../../core/search.ts';
import { titleOf } from '../notes/model/fields.ts';
import type { AgentContext } from '../../core/extension.ts';
import type { Host } from '../../core/host.tsx';
import { agentWriter, type Writer } from '../../core/writer.ts';
import { go, parseRoute } from '../../core/route.ts';
import { appVersion, collect, type Place } from './meta.ts';
import { recordExchange, type ChatTurn, type Collected } from './record.ts';
import type { OnScreen } from './tools.ts';
import { agentPage } from './routes.ts';
import { historyPage } from '../editor/routes.ts';

export const MODEL_KEY = 'vault.agent.model';
export const DEFAULT_MODEL = 'gpt-6-astra';
export const model = () => localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL;

export type Part =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool';
      name: string;
      /** The call in a line (brief), and in full. */
      input: string;
      args?: unknown;
      output?: unknown;
      result?: string;
      error?: boolean;
      commit?: string;
    };
export interface Turn {
  role: 'user' | 'agent';
  parts: Part[];
  error?: string;
  /** When it started, for the raw record; and, for the agent's, what it cost and who answered. */
  at: string;
  tokens?: { in: number; out: number };
  model?: string;
}

/** What views render: replaced on every change, so it's its own snapshot. */
export interface ChatState {
  turns: Turn[];
  busy: boolean;
  /** A reply finished while no view was open. */
  unread: boolean;
}

export const chat = {
  /** This chat, in its exchanges' session: a random id per chat. */
  id: crypto.randomUUID().slice(0, 8),
  state: { turns: [], busy: false, unread: false } as ChatState,
  /** Turns before this one are in a capture already. */
  captured: 0,
  /** What the device says about the current turn, collected while the agent works. */
  meta: null as Promise<Collected> | null,
  history: [] as ModelMessage[],
  abort: null as AbortController | null,
  host: null as Host | null,
  /** Views open on the chat: a reply that finishes with none is unread. */
  views: 0,
  /** What's typed and not sent yet, kept when the panel closes. */
  draft: '',
  /** The last panel opening (PanelArg.n) taken in. */
  arg: 0,
  listeners: new Set<() => void>(),
};

const set = (s: Partial<ChatState>) => {
  chat.state = { ...chat.state, ...s };
  for (const f of chat.listeners) f();
};
const subscribe = (f: () => void) => {
  chat.listeners.add(f);
  return () => {
    chat.listeners.delete(f);
  };
};
export const useChat = () => useSyncExternalStore(subscribe, () => chat.state);

/** Whether the agent can run here: the sealed OpenAI key and a backend that commits. */
export const ready = (host: Host) => !!host.secrets?.openai && !!host.writer.commit;

/** A view on the chat is open; the returned function closes it. Opening one reads the reply. */
export function viewing() {
  chat.views++;
  if (chat.state.unread) set({ unread: false });
  return () => {
    chat.views--;
  };
}

/** Starts over: a new chat (and session in the raw record), unless a turn is running. */
export function newChat() {
  if (chat.state.busy) return;
  chat.id = crypto.randomUUID().slice(0, 8);
  chat.captured = 0;
  chat.history = [];
  chat.meta = null;
  set({ turns: [], unread: false });
}

/** What Jim is looking at: the note on screen, or the page's name (none on the agent's own page). */
export function onScreen(host: Host, path = parseRoute(location.hash).path): OnScreen | undefined {
  const n = host.vault.byHref.get(path);
  if (n) return { title: titleOf(n), path: n.path };
  if (agentPage.match(path)) return undefined;
  const title = host.extensions.map((e) => e.page?.(path, host)).find(Boolean)?.title;
  return title ? { title } : undefined;
}

/** The tool call in a line: its path or query, not the whole file. */
const brief = (name: string, input: any) =>
  input?.path ??
  input?.query ??
  input?.message ??
  (name === 'check' ? '' : JSON.stringify(input ?? {}).slice(0, 80));

/** A turn as the raw record takes it: what was said, and which tools the agent used. */
const chatTurn = (t: Turn): ChatTurn => ({
  role: t.role,
  at: t.at,
  text: t.parts
    .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    .join('')
    .trim(),
  tools: t.parts.flatMap((p) => (p.kind === 'tool' ? [p.name] : [])),
  tokens: t.tokens,
  model: t.model,
});

/** The vault's place notes with coordinates, to match a location fix against. */
const placesOf = (host: Host): Place[] =>
  host.vault.notes.flatMap((n) => {
    const g = n.data.geo;
    return n.data.type === 'place' && typeof g?.lat === 'number' && typeof g?.lon === 'number'
      ? [{ id: n.id, lat: g.lat, lon: g.lon }]
      : [];
  });

/** The tool result in a line. */
const resultOf = (out: any): string =>
  out?.error
    ? out.error + (out.problems ? `: ${out.problems.join('; ')}` : '')
    : out?.committed
      ? `committed ${out.committed}`
      : out?.problems
        ? out.problems.length
          ? `${out.problems.length} problems`
          : 'check passes'
        : out?.staged
          ? `staged: ${out.staged.join(', ')}`
          : 'ok';

/** The tools: the latest writer and search, also between renders and with no view open. */
function context(): AgentContext {
  const host = () => chat.host!;
  const aw = agentWriter(() => host().writer as Writer);
  return {
    w: aw,
    search: (q: string) => search(host().index, q),
    since: host().since,
    secrets: host().secrets ?? undefined,
    capture: async (judged) => {
      const r = recordExchange({
        turns: chat.state.turns.slice(chat.captured).map(chatTurn),
        judged,
        collected: (await chat.meta) ?? { groups: {} },
        session: { chat: chat.id, model: model(), app: appVersion() },
        files: aw.files(),
      });
      await aw.stage(r.path, r.text);
      chat.captured = chat.state.turns.length;
      return { path: r.path, at: r.exchange.at, raw: r.raw };
    },
  };
}

/** Says `text` to the agent, as Jim on `page` (the one on screen by default). */
export async function send(text: string, page = chat.host ? onScreen(chat.host) : undefined) {
  const { host } = chat;
  const said = text.trim();
  if (!said || chat.state.busy || !host || !ready(host)) return;
  const now = new Date().toISOString();
  const agentTurn: Turn = { role: 'agent', parts: [], at: now };
  const update = () => set({ turns: [...chat.state.turns] });
  set({
    busy: true,
    turns: [
      ...chat.state.turns,
      { role: 'user', parts: [{ kind: 'text', text: said }], at: now },
      agentTurn,
    ],
  });
  chat.meta = collect(placesOf(host)).catch(() => ({ groups: {} }));
  chat.history = [...chat.history, { role: 'user', content: said }];
  chat.abort = new AbortController();
  try {
    const [{ runAgent }, { createOpenAI }] = await Promise.all([
      import('./tools.ts'),
      import('@ai-sdk/openai'),
    ]);
    const openai = createOpenAI({
      apiKey: host.secrets!.openai,
      baseURL: import.meta.env.VITE_OPENAI_API || undefined,
    });
    const ctx = context();
    const tools: ToolSet = Object.assign(
      {},
      ...(await Promise.all(host.extensions.map((e) => e.tools?.(ctx) ?? {}))),
    );
    const run = runAgent(openai(model()), ctx, chat.history, tools, chat.abort.signal, page);
    const calls = new Map<string, Part & { kind: 'tool' }>();
    for await (const p of run.stream) {
      if (p.type === 'text-delta') {
        const last = agentTurn.parts.at(-1);
        if (last?.kind === 'text') last.text += p.text;
        else agentTurn.parts.push({ kind: 'text', text: p.text });
      } else if (p.type === 'tool-call') {
        const part: Part & { kind: 'tool' } = {
          kind: 'tool',
          name: p.toolName,
          input: brief(p.toolName, p.input),
          args: p.input,
        };
        calls.set(p.toolCallId, part);
        agentTurn.parts.push(part);
      } else if (p.type === 'tool-result' || p.type === 'tool-error') {
        const part = calls.get(p.toolCallId);
        if (part) {
          const out: any = p.type === 'tool-result' ? p.output : { error: String(p.error) };
          part.output = out;
          part.error = !!out?.error;
          part.commit = out?.committed;
          part.result = resultOf(out);
          if (part.commit)
            toast.success(`Committed ${part.commit}`, {
              action: { label: 'History', onClick: () => go(historyPage.href()) },
            });
        }
      } else if (p.type === 'finish-step') {
        const t = agentTurn.tokens ?? { in: 0, out: 0 };
        agentTurn.tokens = {
          in: t.in + (p.usage.inputTokens ?? 0),
          out: t.out + (p.usage.outputTokens ?? 0),
        };
        agentTurn.model = p.response.modelId || agentTurn.model;
      } else if (p.type === 'error') {
        agentTurn.error = String((p.error as any)?.message ?? p.error);
      }
      update();
    }
    chat.history = await run.done;
  } catch (e) {
    agentTurn.error = (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message;
  } finally {
    chat.abort = null;
    const unseen = chat.views === 0;
    set({ busy: false, turns: [...chat.state.turns], unread: unseen });
    if (unseen)
      toast('The agent replied', {
        action: { label: 'Open', onClick: () => chat.host?.ui.openPanel('agent') },
      });
  }
}

/** Stops the running turn. */
export const stop = () => chat.abort?.abort();

// The conversation with the agent, for the session: outside any view, so it survives the panel closing and
// moving around the app, and a running turn keeps going meanwhile. `send` works with no view open; the
// controller owns its live vault dependency. The model and the SDK load on the
// first send.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { toast } from 'sonner';
import type { ModelMessage, ToolSet } from 'ai';

import type { AgentContext } from './context.ts';
import { searchNotes, type Change, type OwnedVault, type Vault } from '../../vault/index.ts';
import { model, type ModelProvider } from './model.ts';

import { appVersion, collect, type Place } from './meta.ts';
import { recordExchange, type ChatTurn, type Collected } from './record.ts';
import type { OnScreen } from './tools.ts';

import { graphOf } from '../../vault/documents/graph.ts';

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

export interface ConversationOptions {
  vault: Vault;
  model: ModelProvider | null;
  tools?: (vault: OwnedVault) => ToolSet | Promise<ToolSet>;
  page?: OnScreen;
  onCommit?: (sha: string) => void;
  collect?: () => Promise<Collected>;
}

export function createConversation(initial: ConversationOptions) {
  let options = initial;
  let disposed = false;
  const chat = {
    /** This chat, in its exchanges' session: a random id per chat. */
    id: crypto.randomUUID().slice(0, 8),
    state: { turns: [], busy: false, unread: false } as ChatState,
    /** Turns before this one are in a capture already. */
    captured: 0,
    /** What the device says about the current turn, collected while the agent works. */
    meta: null as Promise<Collected> | null,
    history: [] as ModelMessage[],
    abort: null as AbortController | null,

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
    if (!disposed) for (const f of chat.listeners) f();
  };
  const subscribe = (f: () => void) => {
    chat.listeners.add(f);
    return () => {
      chat.listeners.delete(f);
    };
  };

  /** Whether the agent can run here: the sealed OpenAI key and a backend that commits. */
  const ready = () => !disposed && !!options.model && !!options.vault.commit;

  /** A view on the chat is open; the returned function closes it. Opening one reads the reply. */
  function viewing() {
    chat.views++;
    if (chat.state.unread) set({ unread: false });
    return () => {
      chat.views--;
    };
  }

  /** Starts over: a new chat (and session in the raw record), unless a turn is running. */
  function newChat() {
    if (disposed || chat.state.busy) return;
    chat.id = crypto.randomUUID().slice(0, 8);
    chat.captured = 0;
    chat.history = [];
    chat.meta = null;
    chat.draft = '';
    set({ turns: [], unread: false });
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
  const placesOf = (vault: Vault): Place[] =>
    graphOf(vault.files()).notes.flatMap((n) => {
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
  function context(aw: OwnedVault): AgentContext {
    return {
      w: aw,
      search: (q: string) => searchNotes(aw, q),
      capture: async (judged) => {
        const collected = (await chat.meta) ?? { groups: {} };
        let recorded: ReturnType<typeof recordExchange> | undefined;
        await aw.update((files) => {
          const r = recordExchange({
            turns: chat.state.turns.slice(chat.captured).map(chatTurn),
            judged,
            collected,
            session: { chat: chat.id, model: model(), app: appVersion() },
            files,
          });
          recorded = r;
          return [{ path: r.path, text: r.text }];
        });
        const r = recorded!;
        chat.captured = chat.state.turns.length;
        return { path: r.path, at: r.exchange.at, raw: r.raw };
      },
    };
  }

  /** Says `text` to the agent, as Jim on `page` (the one on screen by default). */
  async function send(text: string, page = options.page, staged: Change[] | 'reject' = 'reject') {
    const said = text.trim();
    if (!said || chat.state.busy || !ready()) return;
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
    chat.meta = (options.collect ? options.collect() : collect(placesOf(options.vault))).catch(
      () => ({ groups: {} }),
    );
    chat.history = [...chat.history, { role: 'user', content: said }];
    const abort = new AbortController();
    chat.abort = abort;
    try {
      const { runAgent } = await import('./tools.ts');
      if (abort.signal.aborted || disposed) return;
      const languageModel = await options.model!(model());
      if (abort.signal.aborted || disposed) return;
      await options.vault.write(
        async (owned) => {
          const ctx = context(owned);
          const tools = (await options.tools?.(owned)) ?? {};
          if (abort.signal.aborted || disposed) return;
          const run = runAgent(languageModel, ctx, chat.history, tools, abort.signal, page);
          const calls = new Map<string, Part & { kind: 'tool' }>();
          for await (const p of run.stream) {
            if (disposed || abort.signal.aborted) break;
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
                if (part.commit) {
                  toast.success(`Committed ${part.commit}`);
                  options.onCommit?.(part.commit);
                }
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
          const history = await run.done;
          if (!(disposed || abort.signal.aborted)) chat.history = history;
        },
        { staged, signal: abort.signal },
      );
    } catch (e) {
      agentTurn.error = (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message;
    } finally {
      chat.abort = null;
      const unseen = chat.views === 0;
      set({ busy: false, turns: [...chat.state.turns], unread: unseen });
      if (unseen && !disposed && !abort.signal.aborted) toast('The agent replied');
    }
  }

  /** Stops the running turn. */
  const stop = () => chat.abort?.abort();
  return {
    chat,
    subscribe,
    snapshot: () => chat.state,
    ready,
    vaultFiles: () => options.vault.files(),
    stagedChanges: () => {
      const before = new Map(options.vault.base().map((file) => [file.path, file.text]));
      const after = new Map(options.vault.files().map((file) => [file.path, file.text]));
      return options.vault.staged().map((path) => ({
        path,
        before: before.get(path) ?? '',
        text: after.get(path) ?? null,
      }));
    },
    viewing,
    newChat,
    send,
    stop,
    update: (next: ConversationOptions) => {
      options = next;
    },
    dispose: () => {
      disposed = true;
      stop();
      chat.listeners.clear();
    },
  };
}

export type Conversation = ReturnType<typeof createConversation>;
export const useChat = (conversation: Conversation) =>
  useSyncExternalStore(conversation.subscribe, conversation.snapshot);

export function useConversation(options: ConversationOptions): Conversation {
  const ref = useRef<Conversation | null>(null);
  ref.current ??= createConversation(options);
  const conversation = ref.current;
  conversation.update(options);
  useChat(conversation);
  useEffect(() => () => conversation.dispose(), [conversation]);
  return conversation;
}

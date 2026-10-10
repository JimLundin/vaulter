// Node-backed Chat lifetime, independent of any mounted view. Legacy controller remains until #41.
import type { ChatState, Turn, Part } from './conversation.ts';
import { createNodeChatBackend } from './node-backend.ts';
import type { NodeChatOptions, NodeChatRun, NodeChatRunState } from './node-backend.ts';
import type { MessageData } from './records/chat.ts';

export interface NodeConversationOptions extends NodeChatOptions {
  readonly selectedModel: string;
  readonly conversation?: string;
}
export interface NodeConversationState extends ChatState {
  readonly phase?: NodeChatRunState['phase'];
  readonly persistenceError?: string;
  readonly persistenceStage?: NodeChatRunState['persistenceStage'];
}
function turn(data: MessageData): Turn {
  if (data.role === 'user')
    return { role: 'user', at: data.at, parts: [{ kind: 'text', text: data.text }] };
  const parts: Part[] = data.parts.map((part) =>
    part.kind === 'text'
      ? { kind: 'text', text: part.text }
      : {
          kind: 'tool',
          name: part.name,
          input: JSON.stringify(part.input).slice(0, 80),
          args: part.input,
          ...(part.output !== undefined ? { output: part.output } : {}),
          ...(part.error
            ? { error: true, result: part.error }
            : { result: part.status === 'running' ? 'Outcome uncertain' : 'Accepted' }),
        },
  );
  return {
    role: 'agent',
    at: data.at,
    parts,
    ...(data.error ? { error: data.error } : {}),
    ...(data.model ? { model: data.model } : {}),
    ...(data.tokens ? { tokens: data.tokens } : {}),
  };
}
export function createNodeConversation(initial: NodeConversationOptions) {
  let backend = createNodeChatBackend(initial);
  const backends = new Set([backend]);
  let activeBackend = backend;
  let unsubscribeActive: (() => void) | undefined;
  let options = initial;
  let id = initial.conversation ?? crypto.randomUUID();
  let state: NodeConversationState = {
    draft: '',
    turns: [],
    suggestions: [],
    busy: false,
    unread: false,
  };
  const listeners = new Set<() => void>();
  let active: NodeChatRun | undefined;
  let activeBase: Turn[] = [];
  let views = 0;
  let disposed = false;
  const set = (next: Partial<NodeConversationState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const reflect = () => {
    if (!active) return;
    const current = active.snapshot();
    set({
      turns: [...activeBase, turn(current.response)],
      phase: current.phase,
      busy: ['queued', 'accepting', 'running', 'saving', 'paused'].includes(current.phase),
      persistenceError: current.persistenceError,
      persistenceStage: current.persistenceStage,
    });
  };
  async function send(text: string) {
    const said = text.trim();
    if (disposed || state.busy || state.persistenceError || !said) return;
    const at = new Date().toISOString();
    activeBase = [...state.turns, { role: 'user', at, parts: [{ kind: 'text', text: said }] }];
    activeBackend = backend;
    unsubscribeActive?.();
    active = activeBackend.send({
      id: crypto.randomUUID(),
      conversation: id,
      text: said,
      model: options.selectedModel,
    });
    unsubscribeActive = active.subscribe(reflect);
    reflect();
    await active.done;
    reflect();
    if (!state.persistenceError && state.phase !== 'recorded')
      set({
        turns: (await activeBackend.messages(id)).map(({ data }) => turn(data)),
        unread: views === 0,
      });
    else set({ busy: false });
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    conversation: () => id,
    setDraft: (draft: string) => set({ draft }),
    ready: () => !(disposed || state.persistenceError),
    updateOptions: (next: NodeConversationOptions) => {
      options = next;
      backend = createNodeChatBackend(next);
      backends.add(backend);
    },
    send,
    sendDraft: async () => {
      const text = state.draft;
      if (!text.trim() || state.busy || state.persistenceError) return;
      set({ draft: '' });
      await send(text);
    },
    stop: () => {
      active?.stop();
    },
    retrySave: async () => {
      if (!active) return;
      await active.retrySave();
      reflect();
      if (!(state.persistenceError || state.busy))
        set({ turns: (await activeBackend.messages(id)).map(({ data }) => turn(data)) });
    },
    viewing: () => {
      views++;
      if (state.unread) set({ unread: false });
      return () => {
        views--;
      };
    },
    open: async (conversation: string) => {
      if (state.busy) return;
      id = conversation;
      set({
        turns: (await activeBackend.messages(id)).map(({ data }) => turn(data)),
        unread: false,
      });
    },
    newChat: () => {
      if (state.busy || state.persistenceError) return;
      id = crypto.randomUUID();
      active = undefined;
      set({ turns: [], draft: '', suggestions: [], unread: false });
    },
    dispose: () => {
      disposed = true;
      unsubscribeActive?.();
      for (const owned of backends) owned.dispose();
      listeners.clear();
    },
  };
}
export type NodeConversation = ReturnType<typeof createNodeConversation>;

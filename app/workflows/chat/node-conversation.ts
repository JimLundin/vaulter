// Node-backed Chat lifetime, independent of any mounted view.
import type { ChatState, Turn, Part } from './view.ts';
import { createNodeChatBackend } from './node-backend.ts';
import type { NodeChatOptions, NodeChatRun, NodeChatRunState } from './node-backend.ts';
import type { MessageData } from './records/chat.ts';
import { generateSuggestions, type SuggestionProvider } from './suggestions.ts';

export interface NodeConversationOptions extends NodeChatOptions {
  readonly selectedModel: string;
  readonly conversation?: string;
  readonly availability?: string;
  readonly suggestions?: SuggestionProvider;
  readonly stagedChanges?: () => { path: string; before: string; text: string | null }[];
  readonly onConversation?: (id: string) => void;
}
export interface NodeConversationState extends ChatState {
  readonly phase?: NodeChatRunState['phase'];
  readonly persistenceError?: string;
  readonly persistenceStage?: NodeChatRunState['persistenceStage'];
  readonly contentPersistence?: NodeChatRunState['contentPersistence'];
  readonly contentAccepted?: string;
  readonly contextError?: string;
}
function turn(data: MessageData, live = false, outcomePending = false): Turn {
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
            : part.status === 'running'
              ? live
                ? {}
                : { result: 'Outcome uncertain' }
              : { result: outcomePending ? 'Completed; save pending' : 'Accepted' }),
        },
  );
  return {
    role: 'agent',
    at: data.at,
    parts,
    ...(data.error ? { error: data.error } : {}),
    ...(data.status === 'running' && !live ? { status: 'unknown' as const } : {}),
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
  let suggestedFor: string | undefined;
  let suggestionAbort: AbortController | undefined;
  const ready = () => !(disposed || options.availability);
  const suggest = async () => {
    if (
      !(ready() && options.model) ||
      state.busy ||
      state.persistenceError ||
      state.contentPersistence ||
      state.contextError
    )
      return;
    const key = `${id}:${state.turns.length}:${options.selectedModel}`;
    if (key === suggestedFor) return;
    suggestedFor = key;
    suggestionAbort?.abort();
    const abort = new AbortController();
    suggestionAbort = abort;
    const context = {
      files: [],
      turns: state.turns.map(({ role, parts }) => ({
        role,
        text: parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join(''),
      })),
    };
    try {
      const suggestions = options.suggestions
        ? await options.suggestions(context, abort.signal)
        : await generateSuggestions(options.model, options.selectedModel, context, abort.signal);
      if (!(disposed || abort.signal.aborted)) set({ suggestions });
    } catch {
      /* Suggestions are optional and never execute tools. */
    }
  };
  const set = (next: Partial<NodeConversationState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const reflect = () => {
    if (!active) return;
    const current = active.snapshot();
    if (
      active.prepared() &&
      current.execution &&
      current.phase !== 'accepting' &&
      current.persistenceStage !== 'initial'
    )
      options.onConversation?.(id);
    set({
      turns: [
        ...activeBase,
        turn(
          current.response,
          current.phase !== 'recorded',
          current.persistenceStage === 'outcome',
        ),
      ],
      phase: current.phase,
      busy: ['queued', 'accepting', 'running', 'saving', 'paused'].includes(current.phase),
      persistenceError: current.persistenceError,
      persistenceStage: current.persistenceStage,
      contentPersistence: current.contentPersistence,
      contentAccepted: current.contentAccepted,
      contextError: current.contextError,
    });
  };
  async function send(text: string) {
    const said = text.trim();
    if (
      !ready() ||
      state.busy ||
      state.persistenceError ||
      state.contentPersistence ||
      state.contextError ||
      !said
    )
      return;
    suggestionAbort?.abort();
    suggestedFor = undefined;
    set({ suggestions: [] });
    const at = new Date().toISOString();
    activeBase = [...state.turns, { role: 'user', at, parts: [{ kind: 'text', text: said }] }];
    activeBackend = backend;
    unsubscribeActive?.();
    const sentBackend = activeBackend;
    const sent = activeBackend.send({
      id: crypto.randomUUID(),
      conversation: id,
      text: said,
      model: options.selectedModel,
    });
    active = sent;
    unsubscribeActive = sent.subscribe(reflect);
    reflect();
    await sent.done;
    if (disposed || active !== sent) return;
    reflect();
    if (
      active.prepared() &&
      active.snapshot().execution &&
      active.snapshot().persistenceStage !== 'initial'
    )
      options.onConversation?.(id);
    if (
      sent.snapshot().execution &&
      !(state.persistenceError || state.busy) &&
      state.phase !== 'recorded'
    ) {
      try {
        const messages = await sentBackend.messages(id);
        if (!disposed && active === sent)
          set({ turns: messages.map(({ data }) => turn(data)), unread: views === 0 });
      } catch (error) {
        set({ contextError: error instanceof Error ? error.message : String(error) });
      }
    } else if (!state.busy) set({ busy: false });
  }
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    conversation: () => id,
    setDraft: (draft: string) => set({ draft }),
    ready,
    availability: () => options.availability,
    stagedChanges: () => options.stagedChanges?.() ?? [],
    suggest,
    updateOptions: (next: NodeConversationOptions) => {
      const changed = [
        'nodes',
        'model',
        'tools',
        'user',
        'agent',
        'provider',
        'instructions',
        'selectedModel',
        'settings',
        'enabledTools',
        'writableKinds',
        'contentPolicy',
      ].some((key) => Reflect.get(options, key) !== Reflect.get(next, key));
      options = next;
      if (!changed) return;
      const previous = backend;
      backend = createNodeChatBackend(next);
      if (previous !== activeBackend || !active) {
        previous.dispose();
        backends.delete(previous);
      }
      backends.add(backend);
    },
    send,
    sendDraft: async () => {
      const text = state.draft;
      if (
        !(ready() && text.trim()) ||
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError
      )
        return;
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
      if (active.prepared() && active.snapshot().persistenceStage !== 'initial')
        options.onConversation?.(id);
      if (!(state.persistenceError || state.busy))
        set({ turns: (await activeBackend.messages(id)).map(({ data }) => turn(data)) });
    },
    retryContentSave: async () => {
      await active?.retryContentSave();
      reflect();
    },
    refreshContext: async () => {
      await active?.refreshContext();
      reflect();
      if (state.contextError) return;
      try {
        const messages = await activeBackend.messages(id);
        set({ turns: messages.map(({ data }) => turn(data)), contextError: undefined });
      } catch (error) {
        set({ contextError: error instanceof Error ? error.message : String(error) });
      }
    },
    viewing: () => {
      views++;
      if (state.unread) set({ unread: false });
      return () => {
        views--;
      };
    },
    open: async (conversation: string) => {
      if (
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError ||
        disposed
      )
        return;
      const messages = await backend.messages(conversation);
      if (
        disposed ||
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError
      )
        return;
      unsubscribeActive?.();
      active = undefined;
      id = conversation;
      set({
        turns: messages.map(({ data }) => turn(data)),
        unread: false,
        phase: undefined,
        persistenceError: undefined,
        persistenceStage: undefined,
        contentPersistence: undefined,
        contentAccepted: undefined,
        contextError: undefined,
      });
    },
    newChat: () => {
      if (
        disposed ||
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError
      )
        return;
      unsubscribeActive?.();
      id = crypto.randomUUID();
      active = undefined;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      options.onConversation?.(id);
      set({
        turns: [],
        draft: '',
        suggestions: [],
        unread: false,
        phase: undefined,
        persistenceError: undefined,
        persistenceStage: undefined,
        contentPersistence: undefined,
        contentAccepted: undefined,
        contextError: undefined,
      });
    },
    dispose: () => {
      disposed = true;
      suggestionAbort?.abort();
      unsubscribeActive?.();
      for (const owned of backends) owned.dispose();
      listeners.clear();
    },
  };
}
export type NodeConversation = ReturnType<typeof createNodeConversation>;

// Node-backed Chat lifetime, independent of any mounted view.
import type { ChatState, Turn, Part } from './view.ts';
import { createNodeChatBackend } from './node-backend.ts';
import type {
  NodeChatOptions,
  NodeChatRequest,
  NodeChatRun,
  NodeChatRunState,
} from './node-backend.ts';
import type { MessageData } from './records/chat.ts';
import { generateSuggestions, type SuggestionProvider } from './suggestions.ts';
import type { Transcription, TranscriptionState } from './transcription.ts';

/** One task request supplied by the application composition, shared by page and panel views. */
export interface Prompt {
  text: string;
  send: boolean;
  n: number;
}
export interface NodeConversationOptions extends NodeChatOptions {
  readonly selectedModel: string;
  readonly conversation?: string;
  readonly availability?: string;
  readonly suggestions?: SuggestionProvider;
  readonly stagedChanges?: () => { path: string; before: string; text: string | null }[];
  readonly onConversation?: (id: string) => void;
  /** Supplied recording owner. Chat owns its draft association, not this borrowed module. */
  readonly transcription?: Transcription;
}
export interface ChatCapture {
  readonly phase: TranscriptionState['phase'];
  readonly error: string;
  readonly action: 'start' | 'cancel' | 'finish' | 'wait';
  readonly allowed: boolean;
  readonly reason?: string;
}
export interface ChatActionAvailability {
  readonly allowed: boolean;
  readonly reason?: string;
}
/** A retained source association, distinct from later edits even when their text is identical. */
export interface ChatSubmissionIntent {
  readonly text: string;
  readonly sourceRevision?: number;
}
export type ChatSubmissionOutcome =
  | { readonly status: 'blocked'; readonly reason: string }
  | { readonly status: 'owned'; readonly request: NodeChatRequest; readonly done: Promise<void> };
export interface ChatSubmissionReview {
  readonly status: 'review';
  readonly intent: ChatSubmissionIntent;
  readonly files: { path: string; before: string; text: string | null }[];
}
export interface NodeConversationState extends ChatState {
  readonly submission?: NodeChatRequest;
  readonly submissionAvailability: ChatActionAvailability;
  readonly capture: ChatCapture;
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
  let transcription = initial.transcription;
  let state: NodeConversationState = {
    draft: '',
    turns: [],
    suggestions: [],
    busy: false,
    unread: false,
    submissionAvailability: { allowed: false, reason: 'Enter a message.' },
    capture: { phase: 'idle', error: '', action: 'start', allowed: !!transcription },
  };
  const listeners = new Set<() => void>();
  let active: NodeChatRun | undefined;
  let activeBase: Turn[] = [];
  let views = 0;
  let promptSeen = 0;
  let disposed = false;
  let suggestedFor: string | undefined;
  let suggestionAbort: AbortController | undefined;
  let draftRevision = 0;
  let captureDraft:
    | {
        prefix: string;
        conversation: string;
        draftRevision: number;
        session: string | null;
        revision: number;
      }
    | undefined;
  const ready = () => !(disposed || options.availability);
  const recording = () =>
    ['connecting', 'listening', 'finishing'].includes(transcription?.snapshot().phase ?? 'idle');
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
    state = { ...state, capture: captureState(), submissionAvailability: submissionAvailability() };
    for (const listener of listeners) listener();
  };
  const captureState = (): ChatCapture => {
    const current = transcription?.snapshot();
    const phase = current?.phase ?? 'idle';
    const action =
      phase === 'connecting'
        ? 'cancel'
        : phase === 'listening'
          ? 'finish'
          : phase === 'finishing'
            ? 'wait'
            : 'start';
    const reason = disposed
      ? 'This Chat session is closed.'
      : action === 'wait'
        ? 'Finishing the current transcript.'
        : action !== 'start'
          ? undefined
          : !transcription
            ? 'Live transcription is unavailable. You can still type.'
            : (transcription.availability() ??
              (state.busy
                ? 'Wait for the Agent to finish.'
                : state.persistenceError || state.contentPersistence || state.contextError
                  ? 'Resolve the pending recovery before recording.'
                  : undefined));
    return {
      phase,
      error: current?.error ?? '',
      action,
      allowed: !reason,
      ...(reason ? { reason } : {}),
    };
  };
  const submissionAvailability = (text = state.draft): ChatActionAvailability => {
    const reason = disposed
      ? 'This Chat session is closed.'
      : recording()
        ? 'Finish or cancel the current recording before sending.'
        : state.busy
          ? 'Wait for the Agent to finish.'
          : state.persistenceError || state.contentPersistence || state.contextError
            ? 'Resolve the pending recovery before sending.'
            : (options.availability ??
              (!options.selectedModel
                ? 'Select a model before sending.'
                : !text.trim()
                  ? 'Enter a message.'
                  : undefined));
    return { allowed: !reason, ...(reason ? { reason } : {}) };
  };
  const reflectCapture = () => {
    const next = transcription?.snapshot();
    const association = captureDraft;
    if (next && association) {
      if (next.phase === 'connecting' && !association.session) association.session = next.session;
      if (
        next.session === association.session &&
        next.revision !== association.revision &&
        association.conversation === id &&
        association.draftRevision === draftRevision
      ) {
        association.revision = next.revision;
        const separator =
          association.prefix && next.text && !/\s$/.test(association.prefix) ? ' ' : '';
        const draft = `${association.prefix}${separator}${next.text}`;
        if (draft !== state.draft) {
          draftRevision++;
          association.draftRevision = draftRevision;
          set({ draft });
        }
      }
      if (!['connecting', 'listening', 'finishing'].includes(next.phase)) captureDraft = undefined;
    }
    set({});
  };
  let unsubscribeCapture = transcription?.subscribe(reflectCapture);
  state = { ...state, capture: captureState(), submissionAvailability: submissionAvailability() };
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
  function submit(intent: ChatSubmissionIntent): ChatSubmissionOutcome {
    const permission = submissionAvailability(intent.text);
    if (!permission.allowed) return { status: 'blocked', reason: permission.reason! };
    let request: NodeChatRequest;
    let sent: NodeChatRun;
    const sentBackend = backend;
    try {
      request = Object.freeze({
        id: crypto.randomUUID(),
        conversation: id,
        text: intent.text.trim(),
        model: options.selectedModel,
      });
      // Backend synchronously retains this request and handle. Durable acceptance follows later.
      sent = sentBackend.send(request);
    } catch (error) {
      return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
    }
    suggestionAbort?.abort();
    suggestedFor = undefined;
    const at = new Date().toISOString();
    activeBase = [
      ...state.turns,
      { role: 'user', at, parts: [{ kind: 'text', text: request.text }] },
    ];
    activeBackend = sentBackend;
    unsubscribeActive?.();
    active = sent;
    unsubscribeActive = sent.subscribe(reflect);
    const clearSource =
      intent.sourceRevision !== undefined && intent.sourceRevision === draftRevision;
    if (clearSource) {
      captureDraft = undefined;
      draftRevision++;
    }
    set({
      suggestions: [],
      submission: request,
      busy: true,
      phase: 'queued',
      ...(clearSource ? { draft: '' } : {}),
    });
    reflect();
    return { status: 'owned', request, done: complete(sent, sentBackend, request.conversation) };
  }
  async function complete(sent: NodeChatRun, sentBackend: typeof backend, conversation: string) {
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
        const messages = await sentBackend.messages(conversation);
        if (!disposed && active === sent)
          set({ turns: messages.map(({ data }) => turn(data)), unread: views === 0 });
      } catch (error) {
        set({ contextError: error instanceof Error ? error.message : String(error) });
      }
    } else if (!state.busy) set({ busy: false });
  }
  const draftIntent = (): ChatSubmissionIntent => ({
    text: state.draft,
    sourceRevision: draftRevision,
  });
  const api = {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    conversation: () => id,
    setDraft: (draft: string) => {
      if (disposed) return;
      captureDraft = undefined;
      draftRevision++;
      set({ draft });
      transcription?.clear();
    },
    captureAction: async () => {
      const current = captureState();
      if (!current.allowed) return { status: 'blocked' as const, reason: current.reason! };
      if (current.action === 'cancel') {
        captureDraft = undefined;
        transcription?.clear();
      } else if (current.action === 'finish') {
        await transcription?.finish();
      } else {
        captureDraft = {
          prefix: state.draft,
          conversation: id,
          draftRevision,
          session: null,
          revision: 0,
        };
        await transcription?.start();
      }
      return { status: 'performed' as const, action: current.action };
    },
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
      const permissionChanged =
        options.availability !== next.availability || options.selectedModel !== next.selectedModel;
      options = next;
      if (permissionChanged) set({});
      if (transcription !== next.transcription) {
        captureDraft = undefined;
        unsubscribeCapture?.();
        transcription = next.transcription;
        unsubscribeCapture = transcription?.subscribe(reflectCapture);
        set({});
      }
      if (!changed) return;
      const previous = backend;
      backend = createNodeChatBackend(next);
      if (previous !== activeBackend || !active) {
        previous.dispose();
        backends.delete(previous);
      }
      backends.add(backend);
    },
    submissionAvailability,
    /** Capture the source revision before a review or another delayed submission decision. */
    draftIntent,
    submit,
    /** Temporary review adapter: #55 retains/revalidates this task instead of the view. */
    prepareSubmission: (intent = draftIntent()): ChatSubmissionOutcome | ChatSubmissionReview => {
      const permission = submissionAvailability(intent.text);
      if (!permission.allowed) return { status: 'blocked', reason: permission.reason! };
      try {
        const files = options.stagedChanges?.() ?? [];
        if (files.length) return { status: 'review', intent, files };
      } catch (error) {
        return {
          status: 'blocked',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      return submit(intent);
    },
    submitDraft: (): ChatSubmissionOutcome => submit(draftIntent()),
    // Completion-compatible adapters until all callers use explicit owned outcomes (#60).
    send: async (text: string) => {
      const outcome = submit({ text });
      if (outcome.status === 'owned') await outcome.done;
    },
    sendDraft: async () => {
      const outcome = api.submitDraft();
      if (outcome.status === 'owned') await outcome.done;
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
    /** Claim a retained request before either view performs its send or edit action. */
    takePrompt: (prompt: Prompt) => {
      if (disposed || prompt.n <= promptSeen) return false;
      promptSeen = prompt.n;
      return true;
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
        recording() ||
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
        recording() ||
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError
      )
        return;
      unsubscribeActive?.();
      active = undefined;
      id = conversation;
      options.onConversation?.(conversation);
      set({
        turns: messages.map(({ data }) => turn(data)),
        submission: undefined,
        unread: false,
        phase: undefined,
        persistenceError: undefined,
        persistenceStage: undefined,
        contentPersistence: undefined,
        contentAccepted: undefined,
        contextError: undefined,
      });
    },
    /** The vault's conversations, most recently active first. */
    chats: () => backend.chats(),
    subscribeRecords: (listener: () => void) => options.nodes.subscribe(listener),
    /** Continue the most recently active conversation, unless this one already has turns. */
    openLatest: async () => {
      if (state.turns.length || disposed) return;
      const [latest] = await backend.chats();
      if (!latest || state.turns.length || disposed) return;
      await api.open(latest.node);
    },
    newChat: () => {
      if (
        disposed ||
        recording() ||
        state.busy ||
        state.persistenceError ||
        state.contentPersistence ||
        state.contextError
      )
        return;
      unsubscribeActive?.();
      id = crypto.randomUUID();
      draftRevision++;
      active = undefined;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      options.onConversation?.(id);
      set({
        turns: [],
        submission: undefined,
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
      captureDraft = undefined;
      unsubscribeCapture?.();
      transcription?.interrupt();
      suggestionAbort?.abort();
      unsubscribeActive?.();
      for (const owned of backends) owned.dispose();
      listeners.clear();
    },
  };
  return api;
}
export type NodeConversation = ReturnType<typeof createNodeConversation>;

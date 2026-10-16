import type { ChatBackendFactory, ChatRun as NodeChatRun } from './backend.ts';
// Node-backed Chat lifetime, independent of any mounted view.
import type { ChatState, Turn, Part } from './view.ts';
import { createNodeChatBackend } from './node-backend.ts';
import type {
  NodeChatOptions,
  NodeChatRequest,
  NodeChatRunState,
  ChatRecovery,
} from './node-backend.ts';
import type { MessageData } from './records/chat.ts';
import { CONVERSATION_PAGE_SIZE, type SavedChat } from './records/chat-store.ts';
import { generateSuggestions, type SuggestionProvider } from './suggestions.ts';
import type { Transcription, TranscriptionState } from '../../transcription.ts';

/** One task request supplied by the application composition, shared by page and panel views. */
export interface Prompt {
  text: string;
  send: boolean;
  n: number;
}
export interface NodeConversationOptions extends NodeChatOptions {
  readonly backend?: ChatBackendFactory;
  /** Stable owning Vault session. Capability readiness may change within it. */
  readonly session?: object;
  readonly selectedModel: string;
  readonly conversation?: string;
  /** The initial cache/remote read has settled; model and write availability are independent. */
  readonly recordsReady?: boolean;
  readonly onSelectionOutcome?: (outcome: ChatSelectionOutcome) => void;
  readonly availability?: string;
  /** Application admission for starting recording; finishing an owned recording stays available. */
  readonly captureAvailability?: string;
  readonly suggestions?: SuggestionProvider;
  readonly onConversation?: (id: string) => void;
  readonly onNewChat?: () => void;
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
export interface ChatRetainedPrompt extends Readonly<Prompt> {
  readonly conversation: string;
  readonly task: number;
  readonly reason: string;
}
export type ChatPromptOutcome = ChatSubmissionOutcome | { readonly status: 'ignored' | 'edited' };
export type ChatSelectionOutcome =
  | { readonly status: 'selected'; readonly conversation: string }
  | { readonly status: 'blocked'; readonly reason: string }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'superseded' };
export interface ChatSelection {
  readonly pending?: {
    readonly conversation?: string;
    readonly source: 'explicit' | 'restoration';
  };
  readonly error?: string;
  readonly reason?: string;
}
export interface ChatRecords {
  readonly chats: readonly SavedChat[] | null;
  readonly loading: boolean;
  readonly hasMore: boolean;
  readonly error?: string;
}
export interface NodeConversationState extends ChatState {
  readonly prompts: readonly ChatRetainedPrompt[];
  readonly selection: ChatSelection;
  readonly selectionAvailability: ChatActionAvailability;
  readonly records: ChatRecords;
  readonly submission?: NodeChatRequest;
  readonly actionReason?: string;
  readonly submissionAvailability: ChatActionAvailability;
  readonly capture: ChatCapture;
  readonly recovery: ChatRecovery;
  readonly phase?: NodeChatRunState['phase'];
  readonly persistenceError?: string;
  readonly persistenceStage?: NodeChatRunState['persistenceStage'];
  readonly contentPersistence?: NodeChatRunState['contentPersistence'];
  readonly contentAccepted?: string;
  readonly contextError?: string;
}
function turn(data: MessageData, live = false, pendingToolCall?: string): Turn {
  if (data.role === 'user')
    return { role: 'user', at: data.at, parts: [{ kind: 'text', text: data.text }] };
  if (data.role === 'record')
    return {
      role: 'record',
      at: data.at,
      record: data.record,
      parts: [{ kind: 'text', text: data.text }],
    };
  const parts: Part[] = data.parts.map((part) =>
    part.kind === 'text'
      ? { kind: 'text', text: part.text }
      : {
          kind: 'tool',
          callId: part.callId,
          name: part.name,
          ...(part.version !== undefined ? { version: part.version } : {}),
          input: part.input,
          status: part.status,
          ...(part.output !== undefined ? { output: part.output } : {}),
          ...(part.error ? { error: part.error } : {}),
          ...(part.callId === pendingToolCall ? { savePending: true } : {}),
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
  let backend = (initial.backend ?? createNodeChatBackend)(initial);
  const backends = new Set([backend]);
  let activeBackend = backend;
  let unsubscribeActive: (() => void) | undefined;
  let options = initial;
  let id: string = crypto.randomUUID();
  let transcription = initial.transcription;
  let state: NodeConversationState = {
    draft: '',
    selection: {},
    selectionAvailability: { allowed: true },
    records: { chats: null, loading: false, hasMore: false },
    turns: [],
    suggestions: [],
    prompts: [],
    busy: false,
    unread: false,
    submissionAvailability: { allowed: false, reason: 'Enter a message.' },
    capture: { phase: 'idle', error: '', action: 'start', allowed: !!transcription },
    recovery: {},
  };
  const listeners = new Set<() => void>();
  let active: NodeChatRun | undefined;
  let activeBase: Turn[] = [];
  let views = 0;
  let promptSeen = 0;
  let draftPrompt = 0;
  let disposed = false;
  let recordRefreshError: string | undefined;
  let recordRefresh:
    | {
        readonly conversation: string;
        readonly retained?: NodeChatRun;
        readonly done: Promise<void>;
      }
    | undefined;
  const saveRecoveries = new WeakMap<NodeChatRun, Promise<void>>();
  const contentRecoveries = new WeakMap<NodeChatRun, Promise<void>>();
  const completedReplies = new WeakSet<NodeChatRun>();
  let suggestedFor: string | undefined;
  let suggestionAbort: AbortController | undefined;
  let draftRevision = 0;
  let selectionGeneration = 0;
  let explicitSelection = false;
  let recordsGeneration = 0;
  let recordViews = 0;
  let recordsLimit = CONVERSATION_PAGE_SIZE;
  let unsubscribeRecords: (() => void) | undefined;
  let captureSession: string | undefined;
  const releaseCapture = (interrupt = false) => {
    const session = captureSession;
    captureSession = undefined;
    captureDraft = undefined;
    if (session) {
      if (interrupt) transcription?.interrupt(session);
      else transcription?.clear(session);
    }
  };
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
    const conversation = id;
    const generation = selectionGeneration;
    const context = {
      turns: state.turns.map(({ role, record, parts }) => ({
        role,
        ...(record ? { record } : {}),
        text: parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join(''),
      })),
    };
    try {
      const suggestions = options.suggestions
        ? await options.suggestions(context, abort.signal)
        : await generateSuggestions(options.model, options.selectedModel, context, abort.signal);
      if (
        !(disposed || abort.signal.aborted) &&
        id === conversation &&
        generation === selectionGeneration
      )
        set({ suggestions });
    } catch {
      /* Suggestions are optional and never execute tools. */
    }
  };
  const set = (next: Partial<NodeConversationState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    const owned = active?.snapshot().recovery ?? {};
    const refreshError = recordRefreshError ?? owned.refresh?.error;
    const reading = recordRefresh?.conversation === id && recordRefresh.retained === active;
    state = {
      ...state,
      prompts: state.prompts.map((prompt) =>
        prompt.conversation !== id || prompt.task !== selectionGeneration
          ? Object.freeze({
              ...prompt,
              reason: 'Conversation changed. Review this text before using it.',
            })
          : prompt,
      ),
      contextError: refreshError,
      recovery: {
        ...owned,
        ...(refreshError
          ? {
              refresh: {
                error: refreshError,
                label: 'Content view could not refresh; accepted changes are retained',
                inProgress: reading || !!owned.refresh?.inProgress,
                allowed: !(disposed || reading || owned.refresh?.inProgress),
              },
            }
          : {}),
      },
      capture: captureState(),
      submissionAvailability: submissionAvailability(),
      selectionAvailability: selectionAvailability(),
    };
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
      : action !== 'start' && current?.session !== captureSession
        ? 'This recording is owned by another task.'
        : action === 'wait'
          ? 'Finishing the current transcript.'
          : action !== 'start'
            ? undefined
            : !transcription
              ? 'Live transcription is unavailable. You can still type.'
              : (options.captureAvailability ??
                transcription.availability() ??
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
  const submissionPermission = (text: string): ChatActionAvailability => {
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
  const selectionAvailability = (): ChatActionAvailability => {
    const reason = disposed
      ? 'This Chat session is closed.'
      : recording()
        ? 'Finish or cancel the current recording before switching conversations.'
        : state.busy
          ? 'Wait for the Agent to finish before switching conversations.'
          : state.persistenceError || state.contentPersistence || state.contextError
            ? 'Resolve the pending recovery before switching conversations.'
            : undefined;
    return { allowed: !reason, ...(reason ? { reason } : {}) };
  };
  const invalidateSelection = () => {
    explicitSelection = true;
    selectionGeneration++;
  };
  async function readSelection(
    conversation: string,
    generation: number,
    reader: typeof backend,
  ): Promise<ChatSelectionOutcome> {
    try {
      const messages = await reader.messages(conversation);
      if (disposed || generation !== selectionGeneration) return { status: 'superseded' };
      const permission = selectionAvailability();
      if (!permission.allowed) {
        set({ selection: { reason: permission.reason } });
        return { status: 'blocked', reason: permission.reason! };
      }
      unsubscribeActive?.();
      active = undefined;
      recordRefreshError = undefined;
      captureDraft = undefined;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      id = conversation;
      set({
        selection: {},
        turns: messages.map(({ data }) => turn(data)),
        submission: undefined,

        actionReason: undefined,
        suggestions: [],
        unread: false,
        phase: undefined,
        persistenceError: undefined,
        persistenceStage: undefined,
        contentPersistence: undefined,
        contentAccepted: undefined,
        contextError: undefined,
      });
      options.onConversation?.(conversation);
      return { status: 'selected', conversation };
    } catch (error) {
      if (disposed || generation !== selectionGeneration) return { status: 'superseded' };
      const message = error instanceof Error ? error.message : String(error);
      set({ selection: { error: message } });
      return { status: 'failed', error: message };
    }
  }
  async function reloadRecords() {
    if (disposed || options.recordsReady === false) return;
    const generation = ++recordsGeneration;
    const reader = backend;
    set({ records: { ...state.records, loading: true } });
    try {
      const chats = await reader.chats({ limit: recordsLimit + 1 });
      if (!disposed && generation === recordsGeneration)
        set({
          records: {
            chats: Object.freeze(chats.slice(0, recordsLimit)),
            loading: false,
            hasMore: chats.length > recordsLimit,
          },
        });
    } catch (error) {
      if (!disposed && generation === recordsGeneration)
        set({
          records: {
            ...state.records,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
    }
  }
  const submissionAvailability = (text = state.draft): ChatActionAvailability =>
    submissionPermission(text);
  const reflectCapture = () => {
    if (disposed) return;
    const next = transcription?.snapshot();
    const association = captureDraft;
    if (next && association) {
      if (next.phase === 'connecting' && !association.session) {
        association.session = next.session;
        captureSession = next.session ?? undefined;
      }
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
  let unsubscribeCapture: (() => void) | undefined;
  const observeCapture = () => {
    unsubscribeCapture ??= transcription?.subscribe(reflectCapture);
  };
  state = {
    ...state,
    capture: captureState(),
    submissionAvailability: submissionAvailability(),
    selectionAvailability: selectionAvailability(),
  };
  const reflect = () => {
    if (disposed || !active) return;
    const retained = active;
    const current = retained.snapshot();
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
          current.execution?.pendingTool?.stage === 'outcome'
            ? current.execution.pendingTool.execution.call
            : undefined,
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
    if (active === retained) acknowledgeCompletion(retained);
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
    invalidateSelection();
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
      selection: {},
      submission: request,

      actionReason: undefined,
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
        if (!disposed && active === sent) set({ turns: messages.map(({ data }) => turn(data)) });
      } catch (error) {
        if (!disposed && active === sent && id === conversation) {
          recordRefreshError = error instanceof Error ? error.message : String(error);
          set({});
        }
      }
    } else if (!state.busy) set({ busy: false });
  }
  function acknowledgeCompletion(retained: NodeChatRun) {
    const { execution } = retained.snapshot();
    if (
      completedReplies.has(retained) ||
      !execution?.data.output ||
      execution.data.status === 'running' ||
      execution.phase === 'recorded'
    )
      return;
    completedReplies.add(retained);
    set({ unread: views === 0 });
  }
  async function refreshMessages(
    retained: NodeChatRun | undefined,
    owner: typeof backend,
    conversation: string,
  ) {
    try {
      const messages = await owner.messages(conversation);
      if (disposed || active !== retained || id !== conversation) return;
      recordRefreshError = undefined;
      // Reading cannot replace a response which resumed while the records were loading.
      set({ ...(state.busy ? {} : { turns: messages.map(({ data }) => turn(data)) }) });
    } catch (error) {
      if (disposed || active !== retained || id !== conversation) return;
      recordRefreshError = error instanceof Error ? error.message : String(error);
      set({});
    }
  }
  const draftIntent = (): ChatSubmissionIntent => ({
    text: state.draft,
    sourceRevision: draftRevision,
  });
  const draftEditPermission = (): ChatActionAvailability => {
    const reason = disposed
      ? 'This Chat session is closed.'
      : recording()
        ? 'Finish or cancel the current recording before using this text.'
        : undefined;
    return { allowed: !reason, ...(reason ? { reason } : {}) };
  };
  const interpretPrompt = (prompt: Readonly<Prompt>): ChatPromptOutcome => {
    const permission = draftEditPermission();
    if (!permission.allowed) return { status: 'blocked', reason: permission.reason! };
    if (prompt.send && submissionAvailability(prompt.text).allowed)
      return api.prepareSubmission({ text: prompt.text });
    api.setDraft(prompt.text);
    return { status: 'edited' };
  };
  const retainPrompt = (prompt: Readonly<Prompt>, reason: string) =>
    set({
      prompts: [
        ...state.prompts,
        Object.freeze({ ...prompt, conversation: id, task: selectionGeneration, reason }),
      ],
    });
  const api = {
    snapshot: () => state,
    closed: () => disposed,
    subscribe: (listener: () => void) => {
      if (disposed) return () => {};
      observeCapture();
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    conversation: () => id,
    setDraft: (draft: string) => {
      if (disposed) return;
      const session = captureSession;
      captureSession = undefined;
      captureDraft = undefined;
      draftRevision++;
      set({ draft });
      if (session) transcription?.clear(session);
    },
    captureAction: async () => {
      if (!disposed) observeCapture();
      const current = captureState();
      if (!current.allowed) return { status: 'blocked' as const, reason: current.reason! };
      if (current.action === 'cancel') {
        releaseCapture();
      } else if (current.action === 'finish') {
        await transcription?.finish(captureSession);
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
    availability: () => options.availability,
    suggest,
    updateOptions: (next: NodeConversationOptions) => {
      if (disposed) return;
      if ((options.session ?? options.nodes.identity) !== (next.session ?? next.nodes.identity)) {
        api.dispose();
        return;
      }
      const storeChanged = options.nodes !== next.nodes || options.backend !== next.backend;
      const changed = [
        'backend',
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
      const suggestionsChanged =
        options.model !== next.model ||
        options.selectedModel !== next.selectedModel ||
        options.suggestions !== next.suggestions;
      if (suggestionsChanged) {
        suggestionAbort?.abort();
        suggestedFor = undefined;
      }
      const permissionChanged =
        options.availability !== next.availability ||
        options.captureAvailability !== next.captureAvailability ||
        options.selectedModel !== next.selectedModel;
      const readingBecameReady = options.recordsReady === false && next.recordsReady !== false;
      if (changed) {
        const previous = backend;
        backend = (next.backend ?? createNodeChatBackend)(next);
        if (previous !== activeBackend || !active) {
          previous.dispose();
          backends.delete(previous);
        }
        backends.add(backend);
      }
      options = next;
      const transcriptionChanged = transcription !== next.transcription;
      const previousTranscription = transcription;
      let previousCapture: string | undefined;
      if (transcription !== next.transcription) {
        previousCapture = captureSession;
        captureSession = undefined;
        captureDraft = undefined;
        unsubscribeCapture?.();
        unsubscribeCapture = undefined;
        transcription = next.transcription;
      }
      observeCapture();
      if (storeChanged) {
        selectionGeneration++;
        recordsGeneration++;
        recordsLimit = CONVERSATION_PAGE_SIZE;
        unsubscribeRecords?.();
        unsubscribeRecords = undefined;
        set({ selection: {}, records: { chats: null, loading: false, hasMore: false } });
        if (recordViews) {
          unsubscribeRecords = backend.subscribe(() => void reloadRecords());
          void reloadRecords();
        }
      } else {
        if (permissionChanged || transcriptionChanged) set({});
        if (recordViews && (readingBecameReady || (permissionChanged && state.records.error)))
          void reloadRecords();
      }
      if (previousCapture) previousTranscription?.interrupt(previousCapture);
    },
    submissionAvailability,
    /** Capture the source revision before a delayed submission decision. */
    draftIntent,
    prepareSubmission: (intent = draftIntent()): ChatSubmissionOutcome => {
      const outcome = submit(intent);
      if (outcome.status === 'blocked') set({ actionReason: outcome.reason });
      return outcome;
    },
    stop: () => {
      active?.stop();
    },
    retrySave: () => {
      const retained = active;
      const owner = activeBackend;
      const conversation = id;
      if (!retained || disposed) return Promise.resolve();
      const known = saveRecoveries.get(retained);
      if (known !== undefined) return known;
      const recovery = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained.retrySave();
          if (disposed || active !== retained || id !== conversation) return;
          reflect();
          if (retained.prepared() && retained.snapshot().persistenceStage !== 'initial')
            options.onConversation?.(conversation);
          if (!(state.persistenceError || state.busy)) {
            acknowledgeCompletion(retained);
            await refreshMessages(retained, owner, conversation);
          }
        })
        .finally(() => {
          saveRecoveries.delete(retained);
        });
      saveRecoveries.set(retained, recovery);
      return recovery;
    },
    retryContentSave: () => {
      const retained = active;
      const conversation = id;
      if (!retained || disposed) return Promise.resolve();
      const known = contentRecoveries.get(retained);
      if (known !== undefined) return known;
      const recovery = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained.retryContentSave();
          if (!disposed && active === retained && id === conversation) reflect();
        })
        .finally(() => {
          contentRecoveries.delete(retained);
        });
      contentRecoveries.set(retained, recovery);
      return recovery;
    },
    refreshContext: () => {
      const retained = active;
      const owner = active ? activeBackend : backend;
      const conversation = id;
      if (disposed) return Promise.resolve();
      if (recordRefresh?.conversation === conversation && recordRefresh.retained === retained)
        return recordRefresh.done;
      const done = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained?.refreshContext();
          if (disposed || active !== retained || id !== conversation) return;
          reflect();
          if (retained?.snapshot().recovery?.refresh) return;
          await refreshMessages(retained, owner, conversation);
        })
        .finally(() => {
          if (recordRefresh?.done === done) recordRefresh = undefined;
          set({});
        });
      recordRefresh = { conversation, retained, done };
      set({});
      return done;
    },
    /** Claim and interpret supplied application text once for the retained Chat lifetime. */
    receivePrompt: (prompt: Prompt): ChatPromptOutcome => {
      if (disposed || prompt.n <= promptSeen) return { status: 'ignored' };
      promptSeen = prompt.n;
      const outcome = interpretPrompt(prompt);
      if (outcome.status === 'blocked') retainPrompt(prompt, outcome.reason);
      return outcome;
    },
    /** Supplied/suggested text uses the same safe policy; manual typing remains setDraft. */
    editDraft: (text: string): ChatPromptOutcome => {
      const prompt = { n: --draftPrompt, text, send: false };
      const outcome = interpretPrompt(prompt);
      if (outcome.status === 'blocked') retainPrompt(prompt, outcome.reason);
      return outcome;
    },
    applyPrompt: (n: number): ChatPromptOutcome => {
      const prompt = state.prompts.find((pending) => pending.n === n);
      if (!prompt) return { status: 'blocked', reason: 'This text is no longer pending.' };
      if (prompt.conversation !== id || prompt.task !== selectionGeneration) {
        const reason = 'Conversation changed. Review this text and use again.';
        set({
          prompts: state.prompts.map((pending) =>
            pending === prompt
              ? Object.freeze({ ...prompt, conversation: id, task: selectionGeneration, reason })
              : pending,
          ),
        });
        return { status: 'blocked', reason };
      }
      const outcome = interpretPrompt(prompt);
      set({
        prompts:
          outcome.status === 'blocked'
            ? state.prompts.map((pending) =>
                pending.n === n ? Object.freeze({ ...pending, reason: outcome.reason }) : pending,
              )
            : state.prompts.filter((pending) => pending.n !== n),
      });
      return outcome;
    },
    dismissPrompt: (n: number) => {
      set({ prompts: state.prompts.filter((prompt) => prompt.n !== n) });
      return { status: 'dismissed' as const };
    },
    viewing: () => {
      if (disposed)
        return () => {
          /* Closed sessions retain no view. */
        };
      views++;
      if (state.unread) set({ unread: false });
      let released = false;
      return () => {
        if (released) return;
        released = true;
        views--;
      };
    },
    selectionAvailability,
    open: async (conversation: string): Promise<ChatSelectionOutcome> => {
      const permission = selectionAvailability();
      if (!permission.allowed) {
        set({ selection: { ...state.selection, reason: permission.reason } });
        return { status: 'blocked', reason: permission.reason! };
      }
      invalidateSelection();
      const generation = selectionGeneration;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      set({
        selection: { pending: { conversation, source: 'explicit' } },
        suggestions: [],

        actionReason: undefined,
      });
      return readSelection(conversation, generation, backend);
    },
    /** Shared record reading lifetime; views retain only whether their chooser is visible. */
    watchRecords: () => {
      if (disposed) return () => {};
      recordViews++;
      if (recordViews === 1) {
        void reloadRecords();
        unsubscribeRecords = backend.subscribe(() => void reloadRecords());
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        recordViews--;
        if (!recordViews) {
          unsubscribeRecords?.();
          unsubscribeRecords = undefined;
        }
      };
    },
    loadOlderRecords: async () => {
      if (disposed || state.records.loading || !state.records.hasMore) return;
      recordsLimit = (state.records.chats?.length ?? 0) + CONVERSATION_PAGE_SIZE;
      await reloadRecords();
    },
    /** Startup restoration has lower priority than any admitted explicit conversational intent. */
    restore: async (conversation?: string): Promise<ChatSelectionOutcome> => {
      if (disposed || explicitSelection || state.turns.length) return { status: 'superseded' };
      if (!conversation) return { status: 'selected', conversation: id };
      const permission = selectionAvailability();
      if (!permission.allowed) return { status: 'blocked', reason: permission.reason! };
      const generation = ++selectionGeneration;
      const reader = backend;
      set({ selection: { pending: { conversation, source: 'restoration' } } });
      return readSelection(conversation, generation, reader);
    },
    newChat: (): ChatSelectionOutcome => {
      const permission = selectionAvailability();
      if (!permission.allowed) {
        set({ selection: { ...state.selection, reason: permission.reason } });
        return { status: 'blocked', reason: permission.reason! };
      }
      let next: string;
      try {
        next = crypto.randomUUID();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        set({ selection: { ...state.selection, error: message } });
        return { status: 'failed', error: message };
      }
      invalidateSelection();
      unsubscribeActive?.();
      id = next;
      draftRevision++;
      captureDraft = undefined;
      active = undefined;
      recordRefreshError = undefined;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      set({
        selection: {},
        turns: [],
        submission: undefined,

        actionReason: undefined,
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
      options.onNewChat?.();
      return { status: 'selected', conversation: id };
    },
    dispose: () => {
      if (disposed) return;
      explicitSelection = true;
      selectionGeneration++;
      recordsGeneration++;
      unsubscribeRecords?.();
      disposed = true;
      unsubscribeCapture?.();
      releaseCapture(true);
      suggestionAbort?.abort();
      unsubscribeActive?.();
      for (const owned of backends) owned.dispose();
      listeners.clear();
    },
  };
  return api;
}
export type NodeConversation = ReturnType<typeof createNodeConversation>;

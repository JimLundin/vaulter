import type { CheckpointTask, CheckpointState } from './checkpoint-task.ts';
import type { ChatBackend, ChatBackendFactory, ChatRun } from './backend.ts';
// Retained Chat lifetime, independent of any mounted view.
import type { ChatState, Turn, Part } from './view.ts';
import type { ChatOptions, ChatRequest, ChatRunState, ChatRecovery } from './backend.ts';
import type { MessageData } from './message.ts';
import { generateSuggestions, type SuggestionProvider } from './suggestions.ts';
import type { Transcription, TranscriptionState } from '@/modules/transcription/index.ts';

/** One task request supplied by the application composition, shared by page and panel views. */
export interface Prompt {
  text: string;
  send: boolean;
  n: number;
}
export interface ConversationOptions extends ChatOptions {
  readonly backend: ChatBackendFactory;
  /** Stable owning Vault session. Capability readiness may change within it. */
  readonly session: object;
  readonly selectedModel: string;
  /** The initial cache/remote read has settled; model and write availability are independent. */
  readonly recordsReady?: boolean;
  readonly onReadOutcome?: (outcome: ChatReadOutcome) => void;
  readonly availability?: string;
  /** Application admission for starting recording; finishing an owned recording stays available. */
  readonly captureAvailability?: string;
  readonly suggestions?: SuggestionProvider;
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
  | { readonly status: 'owned'; readonly request: ChatRequest; readonly done: Promise<void> };
export interface ChatRetainedPrompt extends Readonly<Prompt> {
  readonly task: number;
  readonly reason: string;
}
export type ChatPromptOutcome = ChatSubmissionOutcome | { readonly status: 'ignored' | 'edited' };
export type ChatReadOutcome =
  | { readonly status: 'loaded' }
  | { readonly status: 'blocked'; readonly reason: string }
  | { readonly status: 'failed'; readonly error: string }
  | { readonly status: 'superseded' };
export interface ChatReadingState {
  readonly pending?: {
    readonly source: 'explicit' | 'restoration';
  };
  readonly error?: string;
  readonly reason?: string;
}
export interface ConversationState extends ChatState {
  readonly checkpoint?: CheckpointState;
  readonly prompts: readonly ChatRetainedPrompt[];
  readonly reading: ChatReadingState;
  readonly readAvailability: ChatActionAvailability;
  readonly submission?: ChatRequest;
  readonly actionReason?: string;
  readonly submissionAvailability: ChatActionAvailability;
  readonly capture: ChatCapture;
  readonly recovery: ChatRecovery;
  readonly phase?: ChatRunState['phase'];
  readonly persistenceError?: string;
  readonly persistenceStage?: ChatRunState['persistenceStage'];
  readonly contentPersistence?: ChatRunState['contentPersistence'];
  readonly contentAccepted?: string;
  readonly contextError?: string;
}
function turn(data: MessageData, live = false, pendingToolCall?: string): Turn {
  if (data.role === 'user')
    return {
      ...(data.embeds && { embeds: data.embeds }),
      role: 'user',
      at: data.at,
      ...(data.input !== undefined && { input: data.input }),
      parts: [{ kind: 'text', text: data.text }],
    };
  if (data.role === 'record')
    return {
      ...(data.embeds && { embeds: data.embeds }),
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
    ...(data.embeds && { embeds: data.embeds }),
    role: 'agent',
    at: data.at,
    parts,
    ...(data.error !== undefined ? { error: data.error } : {}),
    ...(data.status === 'running' && !live ? { status: 'unknown' as const } : {}),
    ...(data.model !== undefined ? { model: data.model } : {}),
    ...(data.tokens !== undefined ? { tokens: data.tokens } : {}),
  };
}
export function createConversation(initial: ConversationOptions) {
  let backend: ChatBackend = initial.backend(initial);
  const backends = new Set([backend]);
  let activeBackend = backend;
  let unsubscribeActive: (() => void) | undefined;
  let options = initial;
  let transcription = initial.transcription;
  let state: ConversationState = {
    draft: '',
    reading: {},
    readAvailability: { allowed: true },
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
  let checkpointTask: CheckpointTask | undefined;
  let checkpointUnsubscribe: (() => void) | undefined;
  let active: ChatRun | undefined;
  let activeBase: Turn[] = [];
  let views = 0;
  let promptSeen = 0;
  let draftPrompt = 0;
  let disposed = false;
  let recordRefreshError: string | undefined;
  let recordRefresh:
    | {
        readonly retained?: ChatRun;
        readonly done: Promise<void>;
      }
    | undefined;
  const saveRecoveries = new WeakMap<ChatRun, Promise<void>>();
  const contentRecoveries = new WeakMap<ChatRun, Promise<void>>();
  const completedReplies = new WeakSet<ChatRun>();
  let suggestedFor: string | undefined;
  let suggestionAbort: AbortController | undefined;
  let draftRevision = 0;
  let readGeneration = 0;
  let explicitTask = false;
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
    const key = `${state.turns.length}:${options.selectedModel}`;
    if (key === suggestedFor) return;
    suggestedFor = key;
    suggestionAbort?.abort();
    const abort = new AbortController();
    suggestionAbort = abort;
    const generation = readGeneration;
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
      if (!(disposed || abort.signal.aborted) && generation === readGeneration)
        set({ suggestions });
    } catch {
      /* Suggestions are optional and never execute tools. */
    }
  };
  const set = (next: Partial<ConversationState>) => {
    if (disposed) return;
    state = { ...state, ...next };
    const owned = active?.snapshot().recovery ?? {};
    const refreshError = recordRefreshError ?? owned.refresh?.error;
    const reading = !!recordRefresh && recordRefresh.retained === active;
    state = {
      ...state,
      prompts: state.prompts.map((prompt) =>
        prompt.task !== readGeneration
          ? Object.freeze({
              ...prompt,
              reason: 'Earlier task changed. Review this text before using it.',
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
      readAvailability: readAvailability(),
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
  const readAvailability = (): ChatActionAvailability => {
    const reason = disposed
      ? 'This Chat session is closed.'
      : recording()
        ? 'Finish or cancel the current recording before reloading Conversation history.'
        : state.busy
          ? 'Wait for the Agent to finish before reloading Conversation history.'
          : state.persistenceError || state.contentPersistence || state.contextError
            ? 'Resolve the pending recovery before reloading Conversation history.'
            : undefined;
    return { allowed: !reason, ...(reason ? { reason } : {}) };
  };
  const invalidateRead = () => {
    explicitTask = true;
    readGeneration++;
  };
  async function readHistory(generation: number, reader: typeof backend): Promise<ChatReadOutcome> {
    try {
      const messages = await reader.messages();
      if (disposed || generation !== readGeneration) return { status: 'superseded' };
      const permission = readAvailability();
      if (!permission.allowed) {
        set({ reading: { reason: permission.reason } });
        return { status: 'blocked', reason: permission.reason! };
      }
      unsubscribeActive?.();
      active = undefined;
      recordRefreshError = undefined;
      captureDraft = undefined;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      set({
        reading: {},
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
      return { status: 'loaded' };
    } catch (error) {
      if (disposed || generation !== readGeneration) return { status: 'superseded' };
      const message = error instanceof Error ? error.message : String(error);
      set({ reading: { error: message } });
      return { status: 'failed', error: message };
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
    readAvailability: readAvailability(),
  };
  const reflect = () => {
    if (disposed || !active) return;
    const retained = active;
    const current = retained.snapshot();
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
    let request: ChatRequest;
    let sent: ChatRun;
    const sentBackend = backend;
    try {
      request = Object.freeze({
        id: crypto.randomUUID(),
        text: intent.text.trim(),
        model: options.selectedModel,
      });
      // Backend synchronously retains this request and handle. Durable acceptance follows later.
      sent = sentBackend.send(request);
    } catch (error) {
      return { status: 'blocked', reason: error instanceof Error ? error.message : String(error) };
    }
    invalidateRead();
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
      reading: {},
      submission: request,
      actionReason: undefined,
      busy: true,
      phase: 'queued',
      ...(clearSource ? { draft: '' } : {}),
    });
    reflect();
    return { status: 'owned', request, done: complete(sent, sentBackend) };
  }
  async function complete(sent: ChatRun, sentBackend: typeof backend) {
    await sent.done;
    if (disposed || active !== sent) return;
    reflect();
    if (
      sent.snapshot().execution &&
      !(state.persistenceError || state.busy) &&
      state.phase !== 'recorded'
    ) {
      try {
        const messages = await sentBackend.messages();
        if (!disposed && active === sent) set({ turns: messages.map(({ data }) => turn(data)) });
      } catch (error) {
        if (!disposed && active === sent) {
          recordRefreshError = error instanceof Error ? error.message : String(error);
          set({});
        }
      }
    } else if (!state.busy) set({ busy: false });
  }
  function acknowledgeCompletion(retained: ChatRun) {
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
  async function refreshMessages(retained: ChatRun | undefined, owner: typeof backend) {
    try {
      const messages = await owner.messages();
      if (disposed || active !== retained) return;
      recordRefreshError = undefined;
      // Reading cannot replace a response which resumed while the records were loading.
      set({ ...(state.busy ? {} : { turns: messages.map(({ data }) => turn(data)) }) });
    } catch (error) {
      if (disposed || active !== retained) return;
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
      prompts: [...state.prompts, Object.freeze({ ...prompt, task: readGeneration, reason })],
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
    timeline: () => backend.timeline?.() ?? Promise.resolve([]),
    watchTimeline: (listener: () => void) => backend.subscribe(listener),
    createCheckpoint: async () => {
      if (
        !(ready() && backend.checkpoint) ||
        ['running', 'stopping'].includes(state.checkpoint?.phase ?? '') ||
        state.checkpoint?.retryable
      )
        return;
      checkpointUnsubscribe?.();
      checkpointTask?.dispose();
      checkpointTask = backend.checkpoint(options.selectedModel);
      const task = checkpointTask;
      const reflect = () => {
        if (!disposed && checkpointTask === task) set({ checkpoint: task.snapshot() });
      };
      checkpointUnsubscribe = task.subscribe(reflect);
      reflect();
      await task.done;
      reflect();
    },
    retryCheckpoint: async () => {
      await checkpointTask?.retry();
    },
    stopCheckpoint: () => checkpointTask?.stop(),
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
    updateOptions: (next: ConversationOptions) => {
      if (disposed) return;
      if (options.session !== next.session) {
        api.dispose();
        return;
      }
      const storeChanged = options.backend !== next.backend;
      const changed = [
        'backend',
        'model',
        'execution',
        'tools',
        'user',
        'agent',
        'provider',
        'instructions',
        'selectedModel',
        'settings',
        'enabledTools',
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
      if (changed) {
        const previous = backend;
        backend = next.backend(next);
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
        readGeneration++;
        set({ reading: {} });
      } else if (permissionChanged || transcriptionChanged) set({});
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
      if (!retained || disposed) return Promise.resolve();
      const known = saveRecoveries.get(retained);
      if (known !== undefined) return known;
      const recovery = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained.retrySave();
          if (disposed || active !== retained) return;
          reflect();
          if (!(state.persistenceError || state.busy)) {
            acknowledgeCompletion(retained);
            await refreshMessages(retained, owner);
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
      if (!retained || disposed) return Promise.resolve();
      const known = contentRecoveries.get(retained);
      if (known !== undefined) return known;
      const recovery = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained.retryContentSave();
          if (!disposed && active === retained) reflect();
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
      if (disposed) return Promise.resolve();
      if (recordRefresh?.retained === retained && recordRefresh) return recordRefresh.done;
      const done = Promise.resolve()
        .then(async () => {
          if (disposed || active !== retained) return;
          await retained?.refreshContext();
          if (disposed || active !== retained) return;
          reflect();
          if (retained?.snapshot().recovery?.refresh) return;
          await refreshMessages(retained, owner);
        })
        .finally(() => {
          if (recordRefresh?.done === done) recordRefresh = undefined;
          set({});
        });
      recordRefresh = { retained, done };
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
      if (prompt.task !== readGeneration) {
        const reason = 'Earlier task changed. Review this text and use again.';
        set({
          prompts: state.prompts.map((pending) =>
            pending === prompt
              ? Object.freeze({ ...prompt, task: readGeneration, reason })
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
    readAvailability,
    reload: async (): Promise<ChatReadOutcome> => {
      const permission = readAvailability();
      if (!permission.allowed) {
        set({ reading: { ...state.reading, reason: permission.reason } });
        return { status: 'blocked', reason: permission.reason! };
      }
      invalidateRead();
      const generation = readGeneration;
      suggestionAbort?.abort();
      suggestedFor = undefined;
      set({
        reading: { pending: { source: 'explicit' } },
        suggestions: [],

        actionReason: undefined,
      });
      return readHistory(generation, backend);
    },
    /** Startup restoration has lower priority than any admitted explicit conversational intent. */
    restore: async (): Promise<ChatReadOutcome> => {
      if (disposed || explicitTask || state.turns.length) return { status: 'superseded' };
      const permission = readAvailability();
      if (!permission.allowed) return { status: 'blocked', reason: permission.reason! };
      const generation = ++readGeneration;
      const reader = backend;
      set({ reading: { pending: { source: 'restoration' } } });
      return readHistory(generation, reader);
    },
    dispose: () => {
      if (disposed) return;
      explicitTask = true;
      readGeneration++;
      disposed = true;
      unsubscribeCapture?.();
      releaseCapture(true);
      suggestionAbort?.abort();
      unsubscribeActive?.();
      checkpointUnsubscribe?.();
      checkpointTask?.dispose();
      for (const owned of backends) owned.dispose();
      listeners.clear();
    },
  };
  return api;
}
export type Conversation = ReturnType<typeof createConversation>;

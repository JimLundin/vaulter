import type { ModelMessage } from 'ai';
import { historyModelMessages } from '../../agent/history.ts';
import type { JsonObject } from '../../vault/nodes/model.ts';
import type { NodeCommit, NodeStore } from '../../vault/nodes/store.ts';
import { canonical, frozen } from '../../vault/nodes/json.ts';
import { serial } from '../../vault/storage/coordination.ts';
import { createAgentBackend } from '../../agent/runtime.ts';
import type { AgentBackendOptions, AgentRun, AgentRunState } from '../../agent/runtime.ts';
import { prepareAgentRun, readAgentRun } from '../../agent/store.ts';
import type { PreparedAgentRun, SuppliedContext } from '../../agent/store.ts';
import type { AgentRunData } from '../../agent/records.ts';
import {
  prepareChatSubmission,
  prepareChatResponse,
  savedChats,
  savedMessages,
} from './records/chat-store.ts';
import type { MessageData, MessagePart } from './records/chat.ts';

export interface NodeChatRequest {
  readonly id: string;
  readonly conversation: string;
  readonly text: string;
  readonly model: string;
}
export interface NodeChatOptions extends AgentBackendOptions {
  readonly user: string;
  readonly agent: string;
  readonly provider: string;
  readonly instructions: string;
  readonly settings?: JsonObject;
  readonly enabledTools?: AgentRunData['enabledTools'];
}
export interface PreparedNodeChat {
  readonly request: NodeChatRequest;
  readonly submission: NodeCommit;
  readonly execution: PreparedAgentRun;
}
export interface NodeChatRunState {
  readonly phase: AgentRunState['phase'] | 'queued';
  readonly response: Extract<MessageData, { role: 'agent' }>;
  readonly execution?: AgentRunState;
  readonly persistenceError?: string;
  readonly persistenceStage?: AgentRunState['persistenceStage'] | 'response';
  readonly contentPersistence?: AgentRunState['contentPersistence'];
  readonly contentAccepted?: string;
  readonly contextError?: string;
}
export interface NodeChatRun {
  readonly snapshot: () => NodeChatRunState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly done: Promise<NodeChatRunState>;
  readonly stop: () => void;
  readonly retrySave: () => Promise<NodeChatRunState>;
  readonly retryContentSave: () => Promise<NodeChatRunState>;
  readonly refreshContext: () => Promise<NodeChatRunState>;
  readonly prepared: () => PreparedNodeChat | undefined;
}
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const queueByStore = new WeakMap<NodeStore, Map<string, ReturnType<typeof serial>>>();
function appendQueue(nodes: NodeStore, conversation: string) {
  let queues = queueByStore.get(nodes);
  if (!queues) {
    queues = new Map();
    queueByStore.set(nodes, queues);
  }
  let queue = queues.get(conversation);
  if (!queue) {
    queue = serial();
    queues.set(conversation, queue);
  }
  return queue;
}

/** Chat projects recorded receipts as context; this never executes tools. */
export function chatModelMessages(
  messages: readonly Awaited<ReturnType<typeof savedMessages>>[number][],
): ModelMessage[] {
  return historyModelMessages(messages.map(({ data }) => data));
}
/** Complete same-ID acceptance request; retain this whole value through uncertain retries. */
export async function prepareNodeChatSubmission(
  options: NodeChatOptions,
  request: NodeChatRequest,
): Promise<PreparedNodeChat> {
  const snapshot = await options.nodes.snapshot();
  const history = snapshot.get(request.conversation)?.data
    ? await savedMessages(options.nodes, request.conversation, snapshot.sequence)
    : [];
  const at = new Date().toISOString();
  const submission = await prepareChatSubmission(options.nodes, {
    transaction: request.id,
    conversation: request.conversation,
    user: options.user,
    text: request.text,
    model: request.model,
    at,
  });
  const context: SuppliedContext[] = [
    {
      data: {
        kind: 'contextInput',
        role: 'system',
        position: 0,
        transformation: 'verbatim',
        content: options.instructions,
      },
    },
  ];
  for (const message of history) {
    const fragments =
      message.data.role === 'agent'
        ? message.data.parts.map((part, index) => ({
            ...message,
            data: { ...message.data, parts: [part] } as MessageData,
            target: message.sources?.[index] ?? message.version.key,
          }))
        : [{ ...message, target: message.version.key }];
    for (const fragment of fragments)
      for (const effective of chatModelMessages([fragment]))
        context.push({
          data: {
            kind: 'contextInput',
            role: effective.role,
            position: context.length,
            transformation: 'generated',
            content: { message: JSON.parse(canonical(effective)) },
          },
          target: fragment.target,
        });
  }
  const user = submission.changes.find(
    (change) => change.data?.kind === 'message' && change.data.role === 'user',
  )!;
  context.push({
    data: {
      kind: 'contextInput',
      role: 'user',
      position: context.length,
      transformation: 'verbatim',
      content: request.text,
    },
    target: { node: user.node, transaction: request.id },
  });
  const execution = await prepareAgentRun(options.nodes, {
    id: request.id,
    run: crypto.randomUUID(),
    agent: options.agent,
    recordedBy: options.user,
    origin: submission.origin,
    at,
    provider: options.provider,
    model: request.model,
    settings: options.settings ?? {},
    enabledTools: options.enabledTools ?? [],
    context,
  });
  const composed = frozen({
    ...submission,
    changes: [...submission.changes, ...execution.commit.changes],
    expectedReads: { ...submission.expectedReads, ...execution.commit.expectedReads },
  });
  return frozen({
    request: structuredClone(request),
    submission,
    execution: { run: execution.run, commit: composed },
  });
}

function responseFrom(
  prepared: PreparedNodeChat,
  state: AgentRunState,
): Extract<MessageData, { role: 'agent' }> {
  const initial = prepared.submission.changes.find(
    (change) => change.data?.kind === 'message' && change.data.role === 'agent',
  )!;
  const retainedTools = (state.tools ?? []).map(({ node, data }) => ({ node, data }));
  if (state.pendingTool?.stage === 'outcome') {
    const { node } = state.pendingTool.request.changes[0]!;
    const index = retainedTools.findIndex((tool) => tool.node === node);
    if (index >= 0) retainedTools[index] = { node, data: state.pendingTool.execution };
    else retainedTools.push({ node, data: state.pendingTool.execution });
  }
  const parts: MessagePart[] = retainedTools.map(({ data }) => ({
    kind: 'tool',
    callId: data.call,
    name: data.name,
    input: data.input,
    status:
      data.status === 'complete' ? 'complete' : data.status === 'running' ? 'running' : 'failed',
    ...(data.output !== undefined ? { output: data.output } : {}),
    ...(data.error ? { error: data.error.message } : {}),
  }));
  if (state.text) parts.push({ kind: 'text', text: state.text });
  return frozen({
    kind: 'message',
    role: 'agent',
    at: String(initial.data!.at),
    status: state.data.status,
    parts,
    model: state.data.model.served ?? state.data.model.requested,
    ...(state.data.usage
      ? { tokens: { in: state.data.usage.input, out: state.data.usage.output } }
      : {}),
    ...(state.data.error ? { error: state.data.error.message } : {}),
  });
}

export function createNodeChatBackend(options: NodeChatOptions) {
  const agent = createAgentBackend(options);
  const handles = new Map<string, { identity: string; handle: NodeChatRun }>();
  let disposed = false;
  function send(input: NodeChatRequest): NodeChatRun {
    if (disposed) throw new Error('Chat backend is disposed');
    const request = frozen({ ...input, text: input.text.trim() });
    if (!(request.id && request.conversation && request.text && request.model))
      throw new Error('Chat submission is incomplete');
    const identity = canonical(request);
    const existing = handles.get(request.id);
    if (existing) {
      if (existing.identity !== identity)
        throw new Error('Request ID reused with different contents');
      return existing.handle;
    }
    const abort = new AbortController();
    const listeners = new Set<() => void>();
    let prepared: PreparedNodeChat | undefined;
    let execution: AgentRun | undefined;
    let pending: NodeCommit | undefined;
    let responseSave: Promise<NodeChatRunState> | undefined;
    let retry: Promise<NodeChatRunState> | undefined;
    let settleAcceptance!: () => void;
    const acceptance = new Promise<void>((resolve) => {
      settleAcceptance = resolve;
    });
    const disposeRelease = () => {
      if (disposed) settleAcceptance();
    };
    abort.signal.addEventListener('abort', disposeRelease);
    let state: NodeChatRunState = frozen({
      phase: 'queued',
      response: {
        kind: 'message',
        role: 'agent',
        at: new Date().toISOString(),
        status: 'running',
        parts: [],
        model: request.model,
      },
    });
    const notify = (next: NodeChatRunState) => {
      state = frozen(structuredClone(next));
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* Observers do not own acceptance. */
        }
      }
    };
    const reflect = () => {
      if (execution && prepared) {
        const current = execution.snapshot();
        notify({
          phase: current.phase,
          response: responseFrom(prepared, current),
          execution: current,
          contentPersistence: current.contentPersistence,
          contentAccepted: current.contentAccepted,
          contextError: current.contextError,
          ...(current.persistenceError
            ? {
                persistenceError: current.persistenceError,
                persistenceStage: current.persistenceStage,
              }
            : {}),
          ...(pending
            ? {
                phase: state.phase,
                response: state.response,
                persistenceError: state.persistenceError,
                persistenceStage: state.persistenceStage,
              }
            : {}),
        });
        if (
          current.phase === 'failed' ||
          (current.phase !== 'accepting' && current.persistenceStage !== 'initial')
        )
          settleAcceptance();
      }
    };
    const saveResponse = async () => {
      if (!(execution && prepared)) return state;
      let current = execution.snapshot();
      if (
        current.phase === 'unsaved' ||
        current.phase === 'paused' ||
        current.phase === 'recorded' ||
        current.data.status === 'running'
      )
        return state;
      try {
        const recorded = await readAgentRun(options.nodes, prepared.execution.run);
        if (recorded)
          current = {
            ...current,
            tools: recorded.tools.map(({ version, data }) => ({ node: version.key.node, data })),
          };
      } catch (error) {
        // A projection refresh cannot invalidate already accepted tool or run outcomes.
        notify({ ...state, contextError: errorMessage(error) });
      }
      if (responseSave !== undefined) return responseSave;
      responseSave = (async () => {
        const response = responseFrom(prepared!, current);
        pending = prepareChatResponse(prepared!.submission, response, options.agent);
        notify({ ...state, phase: 'saving', response });
        try {
          await options.nodes.commit(pending);
          pending = undefined;
          notify({
            ...state,
            phase: response.status,
            response,
            execution: current,
            persistenceError: undefined,
            persistenceStage: undefined,
          });
        } catch (error) {
          notify({
            ...state,
            phase: 'unsaved',
            persistenceError: errorMessage(error),
            persistenceStage: 'response',
          });
        }
        return state;
      })();
      return responseSave;
    };
    const recordedRequest = async () => {
      // This is a read-only lookup by public Send semantics, not a retry of a reconstructed commit.
      // Live retries use the retained full prepared request exclusively.

      let beforeSequence: number | undefined;
      for (;;) {
        // biome-ignore lint/performance/noAwaitInLoops: history pagination depends on its previous cursor.
        const page = await options.nodes.history({ beforeSequence, limit: 100 });
        const accepted = page.find((transaction) => transaction.id === request.id);
        if (accepted) {
          const differences = await options.nodes.changes(accepted.id);
          const user = differences.find(
            ({ after }) => after.data?.kind === 'message' && after.data.role === 'user',
          );
          const run = differences.find(({ after }) => after.data?.kind === 'agentRun');
          const exchange = differences.find(({ after }) => after.data?.kind === 'exchange');
          if (
            user?.after.data?.text !== request.text ||
            run?.after.data?.model == null ||
            exchange?.after.placement?.parent !== request.conversation ||
            accepted.recordedBy !== options.user ||
            run.after.connection?.target.node !== options.agent
          )
            throw new Error('Request ID reused with different contents');
          const requestedModel = run.after.data.model;
          if (
            typeof requestedModel !== 'object' ||
            !('requested' in requestedModel) ||
            requestedModel.requested !== request.model
          )
            throw new Error('Request ID reused with different contents');
          const response = (await savedMessages(options.nodes, request.conversation)).find(
            ({ version, data }) =>
              data.role === 'agent' && version.placement?.parent === exchange.node,
          )?.data;
          if (response?.role !== 'agent') throw new Error('Saved Chat response unavailable');
          notify({ phase: response.status === 'running' ? 'recorded' : response.status, response });
          return true;
        }
        if (page.length < 100) return false;
        beforeSequence = page.at(-1)!.sequence;
      }
    };
    const done = appendQueue(
      options.nodes,
      request.conversation,
    )(async () => {
      if (await recordedRequest()) {
        settleAcceptance();
        return;
      }

      if (abort.signal.aborted) {
        settleAcceptance();
        notify({ ...state, phase: 'stopped', response: { ...state.response, status: 'stopped' } });
        return;
      }
      prepared = await prepareNodeChatSubmission(options, request);
      if (abort.signal.aborted || disposed) {
        settleAcceptance();
        notify({ ...state, phase: 'stopped', response: { ...state.response, status: 'stopped' } });
        return;
      }
      execution = agent.start(prepared.execution);
      if (abort.signal.aborted) execution.stop();
      execution.subscribe(reflect);
      reflect();
      await acceptance;
    })
      .then(async () => {
        if (!execution) return state;
        await execution.done;
        reflect();
        return await saveResponse();
      })
      .catch((error) => {
        settleAcceptance();
        notify({
          ...state,
          phase: 'failed',
          response: { ...state.response, status: 'failed', error: errorMessage(error) },
        });
        return state;
      });
    const handle: NodeChatRun = {
      snapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      done,
      prepared: () => prepared,
      stop: () => {
        abort.abort();
        execution?.stop();
      },
      retryContentSave: async () => {
        await execution?.retryContentSave();
        const current = execution?.snapshot();
        notify({
          ...state,
          execution: current,
          contentPersistence: current?.contentPersistence,
          contentAccepted: current?.contentAccepted,
          contextError: current?.contextError,
        });
        return state;
      },
      refreshContext: async () => {
        await execution?.refreshContext();
        notify({
          ...state,
          execution: execution?.snapshot(),
          contextError: execution?.snapshot().contextError,
        });
        return state;
      },
      retrySave: () => {
        if (retry !== undefined) return retry;
        retry = (async () => {
          if (pending) {
            try {
              await options.nodes.commit(pending);
              pending = undefined;
              notify({
                ...state,
                phase: state.response.status,
                response: state.response,
                execution: state.execution,
                persistenceError: undefined,
                persistenceStage: undefined,
              });
            } catch (error) {
              notify({ ...state, persistenceError: errorMessage(error) });
            }
            return state;
          }
          if (execution) {
            await execution.retrySave();
            reflect();
            if (execution.snapshot().persistenceStage !== 'initial') settleAcceptance();
            return await saveResponse();
          }
          return state;
        })().finally(() => {
          retry = undefined;
        });
        return retry;
      },
    };
    handles.set(request.id, { identity, handle });
    return handle;
  }
  return {
    send,
    chats: () => savedChats(options.nodes),
    messages: (conversation: string, sequence?: number) =>
      savedMessages(options.nodes, conversation, sequence),
    dispose: () => {
      disposed = true;
      agent.dispose();
      for (const { handle } of handles.values()) handle.stop();
    },
  };
}

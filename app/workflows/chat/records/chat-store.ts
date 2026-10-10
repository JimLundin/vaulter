// Chat acceptance and projection over the common node store. Model SDKs stay in the workflow.
import type { NodeVersion } from '../../../vault/nodes/model.ts';
import type {
  NodeChange,
  NodeCommit,
  NodeStore,
  NodeSnapshot,
} from '../../../vault/nodes/store.ts';
import { parseAgentRun, parseToolExecution } from '../../../agent/schema.ts';
import { parseConversation, parseExchange, parseMessage, parseChatInstant } from './chat-schema.ts';
import { frozen } from '../../../vault/nodes/json.ts';
import { chatOperations, type ConversationData, type MessageData } from './chat.ts';

export interface SavedChat {
  readonly node: string;
  readonly data: ConversationData;
  readonly sequence: number;
}
export interface SavedMessage {
  readonly version: NodeVersion;
  readonly data: MessageData;
  /** Exact evidence for projected parts; Chat response status remains its actual accepted status. */
  readonly sources?: readonly NodeVersion['key'][];
}

function projectMessage(snapshot: NodeSnapshot, version: NodeVersion): SavedMessage {
  const data = parseMessage(version.data);
  if (data.role !== 'agent' || data.status !== 'running' || !version.placement)
    return { version, data };
  const parts = [...data.parts];
  const sources = parts.map(() => version.key);
  for (const run of snapshot.children(version.placement.parent)) {
    if (run.data?.kind !== 'agentRun') continue;
    const start = run.connection?.source.transaction;
    if (!start) continue;
    const submitted = snapshot.resolve({ node: version.key.node, transaction: start });
    if (submitted?.data?.role !== 'agent' || submitted.placement?.parent !== run.placement?.parent)
      continue;
    const execution = parseAgentRun(run.data);
    for (const tool of snapshot.children(run.key.node)) {
      if (tool.data?.kind !== 'toolExecution') continue;
      const receipt = parseToolExecution(tool.data);
      const recorded = {
        kind: 'tool' as const,
        callId: receipt.call,
        name: receipt.name,
        input: receipt.input,
        status:
          receipt.status === 'complete'
            ? 'complete'
            : receipt.status === 'running'
              ? 'running'
              : 'failed',
        ...(receipt.output !== undefined ? { output: receipt.output } : {}),
        ...(receipt.error ? { error: receipt.error.message } : {}),
      } as const;
      const index = parts.findIndex((part) => part.kind === 'tool' && part.callId === receipt.call);
      if (index < 0) {
        parts.push(recorded);
        sources.push(tool.key);
      } else {
        const prior = parts[index]!;
        if (prior.kind !== 'tool') continue;
        const { output: _output, error: _error, ...retained } = prior;
        parts[index] = { ...retained, ...recorded };
        sources[index] = tool.key;
      }
    }
    const text = execution.output?.text;
    if (
      typeof text === 'string' &&
      text &&
      !parts.some((part) => part.kind === 'text' && part.text === text)
    ) {
      parts.push({ kind: 'text', text });
      sources.push(run.key);
    }
  }
  return { version, data: { ...data, parts }, sources };
}

/** Page through submissions, retaining one current conversation per identity. */
export async function savedChats(store: NodeStore): Promise<readonly SavedChat[]> {
  const snapshot = await store.snapshot();
  const seen = new Set<string>();
  const chats: SavedChat[] = [];
  let beforeSequence: number | undefined = snapshot.sequence + 1;
  // biome-ignore lint/suspicious/noUnnecessaryConditions: history pagination terminates on the last page.
  while (true) {
    // biome-ignore lint/performance/noAwaitInLoops: each page supplies the next cursor.
    const page = await store.history({
      beforeSequence,
      limit: 100,
      kinds: [chatOperations.submit],
    });
    for (const transaction of page) {
      if (!transaction.origin) continue;
      const exchange = snapshot.get(transaction.origin);
      const node = exchange?.placement?.parent;
      if (!node || seen.has(node)) continue;
      seen.add(node);
      const version = snapshot.get(node);
      if (version?.data == null) continue;
      chats.push({
        node,
        data: parseConversation(version.data),
        sequence: transaction.sequence,
      });
    }
    if (page.length < 100) break;
    beforeSequence = page.at(-1)!.sequence;
  }
  return frozen(chats);
}

export async function savedMessages(
  store: NodeStore,
  node: string,
  sequence?: number,
): Promise<readonly SavedMessage[]> {
  const snapshot = await store.snapshot(sequence);
  parseConversation(snapshot.get(node)?.data);
  return frozen(
    snapshot.children(node).flatMap((exchange) => {
      if (exchange.data?.kind !== 'exchange') return [];
      parseExchange(exchange.data);
      return snapshot
        .children(exchange.key.node)
        .flatMap((version) =>
          version.data?.kind === 'message' ? [projectMessage(snapshot, version)] : [],
        );
    }),
  );
}

/** Prepare once and retain this entire request for an uncertain-acceptance retry. */
export async function prepareChatSubmission(
  store: NodeStore,
  options: {
    readonly transaction: string;
    readonly conversation: string;
    readonly user: string;
    readonly text: string;
    readonly at: string;
    readonly model: string;
  },
): Promise<NodeCommit> {
  if (
    !(
      options.transaction &&
      options.user &&
      options.conversation &&
      options.text.trim() &&
      options.model
    )
  )
    throw new Error('Invalid chat submission');
  parseChatInstant(options.at);
  const snapshot = await store.snapshot();
  const changes: NodeChange[] = [];
  const create = (node: string, data: NodeChange['data'], parent?: string, siblingOrder = 'a') => {
    changes.push({
      node,
      expected: null,
      data,
      placement: parent ? { parent, order: siblingOrder } : null,
      connection: null,
    });
  };
  const existing = snapshot.get(options.conversation);
  if (!snapshot.get(options.user)?.data) throw new Error('Chat author is unavailable');
  if (!existing)
    create(options.conversation, {
      kind: 'conversation',
      title: options.text.slice(0, 120),
      createdAt: options.at,
    });
  else parseConversation(existing.data);
  const exchange = crypto.randomUUID();
  // Append after the current last order without renumbering existing exchanges.
  const order = `${snapshot.children(options.conversation).at(-1)?.placement?.order ?? ''}a`;
  create(exchange, { kind: 'exchange', startedAt: options.at }, options.conversation, order);
  create(
    crypto.randomUUID(),
    { kind: 'message', role: 'user', at: options.at, text: options.text },
    exchange,
    'a',
  );
  create(
    crypto.randomUUID(),
    {
      kind: 'message',
      role: 'agent',
      at: options.at,
      status: 'running',
      parts: [],
      model: options.model,
    },
    exchange,
    'b',
  );
  return frozen({
    id: options.transaction,
    recordedBy: options.user,
    origin: exchange,
    kind: chatOperations.submit,
    message: options.text.slice(0, 120),
    undoOf: null,
    changes,
    expectedReads: {
      [options.user]: snapshot.get(options.user)!.key.transaction,
      ...(existing ? { [options.conversation]: existing.key.transaction } : {}),
    },
  });
}

/** A response versions only its own message, retaining submission and ancestors. */
export function prepareChatResponse(
  submission: NodeCommit,
  data: Extract<MessageData, { role: 'agent' }>,
  agentAuthor: string,
): NodeCommit {
  if (data.status === 'running') throw new Error('Terminal responses cannot be running');
  const agent = submission.changes.find(
    (change) => change.data?.role === 'agent' && change.data.kind === 'message',
  );
  if (!agent) throw new Error('Submission has no agent message');
  const parsed = parseMessage(data);
  if (parsed.role !== 'agent' || data.at !== agent.data?.at)
    throw new Error('Response must retain the submitted agent message timestamp');
  return frozen({
    id: crypto.randomUUID(),
    recordedBy: agentAuthor,
    origin: submission.origin,
    kind: data.status === 'stopped' ? chatOperations.stopResponse : chatOperations.completeResponse,
    message: null,
    undoOf: null,
    changes: [{ ...agent, expected: submission.id, data: parsed }],
  });
}

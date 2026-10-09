// PROTOTYPE: executable walkthrough actions and a small parity probe, shared by browser and CLI.
import type { NodeVersion } from '../model.ts';
import type { NodeChange, NodeCommit, RecordedTransaction } from '../store.ts';
import type { ChatData } from '../../documents/chat.ts';
import { closure, undo, type SpikeStore } from './prototype.ts';

const now = () => new Date().toISOString();
const initial = (
  nodeId: string,
  data: NodeVersion['data'],
  parentNodeId: string | null = null,
  orderKey: string | null = null,
  targetNodeId: string | null = null,
): NodeChange => ({
  nodeId,
  data,
  parentNodeId,
  orderKey,
  targetNodeId,
  expectedTransactionId: null,
});

function request(
  id: string,
  message: string,
  changes: readonly NodeChange[],
  kind: NodeCommit['kind'] = 'content',
): NodeCommit {
  return { id, message, kind, originNodeId: null, undoOfTransactionId: null, changes };
}

export async function seed(store: SpikeStore): Promise<void> {
  await store.reset();
  await store.commit(
    request('seed', 'Create fictional studio content', [
      initial('page-a', { kind: 'document', title: 'Studio plans' }),
      initial('page-b', { kind: 'document', title: 'This week' }),
      initial('paragraph', { kind: 'paragraph', text: 'Leave room for the garden studio.' }),
      initial('appearance-a', { kind: 'appearance' }, 'page-a', 'A', 'paragraph'),
      initial('appearance-b', { kind: 'appearance' }, 'page-b', 'A', 'paragraph'),
      initial('group', { kind: 'group', title: 'Notes' }, 'page-a', 'M'),
      initial('nested', { kind: 'paragraph', text: 'Keep afternoons open.' }, 'group', 'M'),
    ]),
  );
}

export async function change(
  store: SpikeStore,
  nodeId: string,
  patch: Partial<NodeChange>,
): Promise<NodeChange> {
  const current = (await store.snapshot()).get(nodeId);
  if (!current) throw new Error(`Unknown node: ${nodeId}`);
  return {
    nodeId,
    parentNodeId: current.parentNodeId,
    targetNodeId: current.targetNodeId,
    orderKey: current.orderKey,
    data: current.data,
    expectedTransactionId: current.transactionId,
    ...patch,
  };
}

export const actionLabels = {
  send: 'Send a message',
  commit: 'Agent commits a content edit',
  complete: 'Complete the reply',
  stop: 'Stop the reply',
  detach: 'Remove from Studio plans',
  delete: 'Delete shared paragraph',
  restore: 'Restore shared paragraph',
  move: 'Move the notes group',
  deleteGroup: 'Delete the notes group',
  restoreGroup: 'Restore the notes group',
  undo: 'Undo last content change',
  stale: 'Try a stale two-node edit',
  independent: 'Make one appearance independent',
} as const;
export type Action = keyof typeof actionLabels;

/** Actions use the public store, as the existing conversation controller and tools would. */
export function walkthrough(store: SpikeStore) {
  let activeExchange: string | null = null;
  let activeResponse: string | null = null;
  let lastContent: string | null = null;
  const execute = async (action: Action): Promise<RecordedTransaction | string> => {
    const id = crypto.randomUUID();
    if (action === 'send') {
      const snapshot = await store.snapshot();
      const exchangeId = `exchange-${id}`;
      const responseId = `response-${id}`;
      const payload: ChatData = {
        kind: 'message',
        role: 'user',
        at: now(),
        text: 'Make more room for studio work.',
      };
      const changes = [
        initial(
          exchangeId,
          { kind: 'exchange', startedAt: now() },
          'conversation',
          String(snapshot.sequence).padStart(12, '0'),
        ),
        initial(`user-${id}`, payload, exchangeId, 'A'),
        initial(
          responseId,
          { kind: 'message', role: 'agent', at: now(), status: 'running', parts: [] },
          exchangeId,
          'M',
        ),
      ];
      if (!snapshot.get('conversation'))
        changes.unshift(
          initial('conversation', {
            kind: 'conversation',
            title: 'Studio conversation',
            createdAt: now(),
          }),
        );
      const transaction = await store.commit({
        ...request(id, 'Accept chat submission', changes, 'chat'),
        originNodeId: exchangeId,
      });
      activeExchange = exchangeId;
      activeResponse = responseId;
      return transaction;
    }
    if (action === 'complete' || action === 'stop') {
      if (!activeResponse) throw new Error('Send a message first');
      const original = (await store.snapshot()).get(activeResponse)!;
      if (original.data?.status !== 'running')
        throw new Error('This response has already finished');
      const data: ChatData = {
        kind: 'message',
        role: 'agent',
        at: String(original.data.at),
        status: action === 'stop' ? 'stopped' : 'complete',
        parts: [
          {
            kind: 'text',
            text:
              action === 'stop'
                ? 'I started looking at the studio…'
                : 'I left more room for studio work.',
          },
        ],
      };
      return store.commit({
        ...request(
          id,
          action === 'stop' ? 'Record stopped response' : 'Record completed response',
          [await change(store, activeResponse, { data })],
          'chat',
        ),
        originNodeId: activeExchange,
      });
    }
    if (action === 'undo') {
      const content = lastContent ?? (await store.history({ kind: 'content', limit: 1 }))[0]?.id;
      if (!content || content === 'seed') throw new Error('Make a content change first');
      return undo(store, content);
    }
    if (action === 'stale') {
      const stale = await change(store, 'paragraph', {
        data: { kind: 'paragraph', text: 'Stale edit' },
      });
      await store.commit(
        request(id, 'Another writer edits the paragraph', [
          await change(store, 'paragraph', {
            data: { kind: 'paragraph', text: 'Newer content from another writer.' },
          }),
        ]),
      );
      const before = (await store.snapshot()).sequence;
      try {
        await store.commit(
          request(crypto.randomUUID(), 'Stale two-node transaction', [
            await change(store, 'page-b', {
              data: { kind: 'document', title: 'Should never publish' },
            }),
            stale,
          ]),
        );
      } catch (error) {
        if ((await store.snapshot()).sequence !== before)
          throw new Error('Partial stale transaction published', { cause: error });
        return `Rejected atomically: ${String(error)}`;
      }
      throw new Error('Stale transaction unexpectedly succeeded');
    }
    let changes: NodeChange[];
    if (action === 'commit')
      changes = [
        await change(store, 'paragraph', {
          data: { kind: 'paragraph', text: 'Protect two studio afternoons each week.' },
        }),
      ];
    else if (action === 'detach')
      changes = [
        await change(store, 'appearance-a', {
          data: null,
          parentNodeId: null,
          targetNodeId: null,
          orderKey: null,
        }),
      ];
    else if (action === 'delete') changes = [await change(store, 'paragraph', { data: null })];
    else if (action === 'restore')
      changes = [
        await change(store, 'paragraph', {
          data: { kind: 'paragraph', text: 'Leave room for the garden studio.' },
        }),
      ];
    else if (action === 'move')
      changes = [await change(store, 'group', { parentNodeId: 'page-b', orderKey: 'M' })];
    else if (action === 'deleteGroup') changes = [await change(store, 'group', { data: null })];
    else if (action === 'restoreGroup')
      changes = [await change(store, 'group', { data: { kind: 'group', title: 'Notes' } })];
    else {
      const contentId = `independent-${id}`;
      changes = [
        initial(contentId, { kind: 'paragraph', text: 'My own studio plan.' }),
        await change(store, 'appearance-a', {
          data: { kind: 'appearance' },
          parentNodeId: 'page-a',
          orderKey: 'A',
          targetNodeId: contentId,
        }),
      ];
    }
    const transaction = await store.commit({
      ...request(id, actionLabels[action], changes),
      originNodeId: activeExchange,
    });
    lastContent = transaction.id;
    return transaction;
  };
  return { execute };
}

/** A replayable spike probe, not a permanent test suite. Returns observed facts for inspection. */
export async function exercise(store: SpikeStore): Promise<Record<string, unknown>> {
  await seed(store);
  const guide = walkthrough(store);
  const send1 = await guide.execute('send');
  const send2 = await guide.execute('send');
  const accepted2 = typeof send2 === 'string' ? [] : await store.changes(send2.id);
  if (accepted2.some((d) => d.nodeId === 'conversation'))
    throw new Error('Message append versioned an ancestor');
  const edit = await guide.execute('commit');
  await guide.execute('stop');
  const nowSnapshot = await store.snapshot();
  const historical = await store.snapshot(1);
  if (nowSnapshot.get('paragraph')?.data?.text !== 'Protect two studio afternoons each week.')
    throw new Error('Stop lost content');
  if (historical.get('paragraph')?.data?.text !== 'Leave room for the garden studio.')
    throw new Error('History changed');
  await guide.execute('undo');
  if ((await store.snapshot()).children('conversation').length !== 2)
    throw new Error('Content undo erased transcript');
  await guide.execute('delete');
  const deleted = await store.snapshot();
  if (
    closure(deleted, 'page-a').some((v) => v.nodeId === 'paragraph') ||
    !deleted.get('appearance-b')?.targetNodeId
  )
    throw new Error('Deletion closure/reference behavior failed');
  await guide.execute('restore');
  const beforeMove = await store.snapshot();
  await guide.execute('move');
  const moved = await store.snapshot();
  if (
    moved.get('nested')?.transactionId !== 'seed' ||
    !closure(moved, 'page-b').some((v) => v.nodeId === 'nested')
  )
    throw new Error('Group move rewrote or lost descendants');
  const conflict = await guide.execute('stale');
  await guide.execute('independent');
  const retry = request('retry', 'Retry-safe title edit', [
    await change(store, 'page-b', { data: { kind: 'document', title: 'Updated week' } }),
  ]);
  const result = await store.commit(retry);
  const duplicate = await store.commit(structuredClone(retry));
  if (duplicate.sequence !== result.sequence) throw new Error('Retry duplicated history');
  let changedRetryRejected = false;
  try {
    await store.commit({ ...retry, message: 'Different request' });
  } catch {
    changedRetryRejected = true;
  }
  if (!changedRetryRejected) throw new Error('Changed retry accepted');
  const frozenVersion = (await store.snapshot()).get('paragraph');
  if (!Object.isFrozen(frozenVersion?.data)) throw new Error('Snapshot exposes mutable content');
  const head = await store.snapshot();
  const referenceCycle = await store.commit(
    request('reference-cycle', 'Ordinary cross-reference cycle', [
      await change(store, 'page-a', { targetNodeId: 'page-b' }),
      await change(store, 'page-b', { targetNodeId: 'page-a' }),
    ]),
  );
  if (!closure(await store.snapshot(), 'page-a').length)
    throw new Error('Reference cycle did not terminate');
  let cycleRejected = false;
  try {
    await store.commit(
      request('containment-cycle', 'Invalid parent cycle', [
        await change(store, 'group', { parentNodeId: 'nested' }),
      ]),
    );
  } catch {
    cycleRejected = true;
  }
  if (!cycleRejected) throw new Error('Parent cycle accepted');
  await guide.execute('deleteGroup');
  const hidden = await store.snapshot();
  if (
    hidden.children('group').length ||
    closure(hidden, 'page-b').some((v) => v.nodeId === 'nested')
  )
    throw new Error('Deleted container retained visible descendants');
  if (hidden.get('nested')?.transactionId !== 'seed')
    throw new Error('Container deletion rewrote descendants');
  const descendantEdit = await store.commit(
    request('hidden-descendant', 'Edit an unreachable descendant', [
      await change(store, 'nested', { data: { kind: 'paragraph', text: 'Updated while hidden.' } }),
    ]),
  );
  await guide.execute('restoreGroup');
  const restored = await store.snapshot();
  if (!closure(restored, 'page-b').some((v) => v.data?.text === 'Updated while hidden.'))
    throw new Error('Container restoration did not expose current descendant state');
  await store.commit(
    request('later-descendant', 'Another descendant edit', [
      await change(store, 'nested', { data: { kind: 'paragraph', text: 'Keep the later edit.' } }),
    ]),
  );
  let undoConflict = false;
  try {
    await undo(store, descendantEdit.id);
  } catch {
    undoConflict = true;
  }
  if (!undoConflict) throw new Error('Undo overwrote an intervening change');
  const dependent = await change(store, 'page-a', {
    data: { kind: 'document', title: 'Dependent edit' },
  });
  const sequenceBeforeRejection = restored.sequence + 1;
  let readConflict = false;
  try {
    await store.commit({
      ...request('read-dependency', 'Edit based on stale content', [dependent]),
      expectedReads: { nested: descendantEdit.id },
    });
  } catch {
    readConflict = true;
  }
  if (!readConflict || (await store.snapshot()).sequence !== sequenceBeforeRejection)
    throw new Error('Stale read dependency was published');
  return {
    acceptedSubmissions: [send1, send2],
    secondSubmissionVersions: accepted2.map((d) => d.nodeId),
    edit,
    contentSurvivedStop: true,
    transcriptSurvivedUndo: true,
    historicalText: historical.get('paragraph')?.data?.text,
    targetDeletionRetainedAppearances: true,
    descendantVersionAfterMove: moved.get('nested')?.transactionId,
    oldGroupParent: beforeMove.get('group')?.parentNodeId,
    newGroupParent: moved.get('group')?.parentNodeId,
    conflict,
    retrySequence: result.sequence,
    duplicateSequence: duplicate.sequence,
    changedRetryRejected,
    frozenContent: true,
    historicalSnapshotUnchanged: head.sequence < referenceCycle.sequence,
    referenceCycleAllowed: true,
    containmentCycleRejected: true,
    containerDeletionLeftDescendantUnchanged: true,
    containerRestorationRevealedCurrentDescendant: true,
    guardedUndoRejectedInterveningChange: undoConflict,
    staleReadDependencyRejected: readConflict,
    finalSequence: (await store.snapshot()).sequence,
  };
}

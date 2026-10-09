// PROTOTYPE: executable walkthrough actions and a small parity probe, shared by browser and CLI.
import type { NodeVersion, Transaction } from '../model.ts';
import type { NodeChange, NodeCommit } from '../store.ts';
import { chatOperations, type ChatData } from '../../documents/chat.ts';
import { nodeOperations, sameOperation } from '../operations.ts';
import { spikeOperations } from './operations.ts';
import { closure, undo, type SpikeStore } from './prototype.ts';

const now = () => new Date().toISOString();
const initial = (
  node: string,
  data: NodeVersion['data'],
  parent: string | null = null,
  order: string | null = null,
  target: string | null = null,
): NodeChange => ({
  node,
  data,
  parent,
  order,
  target,
  expected: null,
});

function request(
  id: string,
  message: string,
  changes: readonly NodeChange[],
  kind: NodeCommit['kind'] = nodeOperations.update,
): NodeCommit {
  return {
    id,
    message,
    kind,
    recordedBy: 'actor-user',
    origin: null,
    undoOf: null,
    changes,
  };
}

export async function seed(store: SpikeStore): Promise<void> {
  await store.reset();
  await store.commit(
    request(
      'seed',
      'Create fictional studio content',
      [
        initial('actor-user', { kind: 'actor', role: 'user', name: 'Demo user' }),
        initial('actor-agent', { kind: 'actor', role: 'agent', name: 'Studio assistant' }),
        initial('page-a', { kind: 'document', title: 'Studio plans' }),
        initial('page-b', { kind: 'document', title: 'This week' }),
        initial('paragraph', { kind: 'paragraph', text: 'Leave room for the garden studio.' }),
        initial('appearance-a', { kind: 'appearance' }, 'page-a', 'A', 'paragraph'),
        initial('appearance-b', { kind: 'appearance' }, 'page-b', 'A', 'paragraph'),
        initial('group', { kind: 'group', title: 'Notes' }, 'page-a', 'M'),
        initial('nested', { kind: 'paragraph', text: 'Keep afternoons open.' }, 'group', 'M'),
      ],
      spikeOperations.seed,
    ),
  );
}

export async function change(
  store: SpikeStore,
  node: string,
  patch: Partial<NodeChange>,
): Promise<NodeChange> {
  const current = (await store.snapshot()).get(node);
  if (!current) throw new Error(`Unknown node: ${node}`);
  return {
    node,
    parent: current.parent,
    target: current.target,
    order: current.order,
    data: current.data,
    expected: current.transaction,
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
  const execute = async (action: Action): Promise<Transaction | string> => {
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
        ...request(id, 'Accept chat submission', changes, chatOperations.submit),
        origin: exchangeId,
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
          action === 'stop' ? chatOperations.stopResponse : chatOperations.completeResponse,
        ),
        recordedBy: 'actor-agent',
        origin: activeExchange,
      });
    }
    if (action === 'undo') {
      const content =
        lastContent ??
        (
          await store.history({
            kinds: [
              nodeOperations.update,
              nodeOperations.move,
              nodeOperations.delete,
              nodeOperations.restore,
              nodeOperations.detach,
              nodeOperations.fork,
            ],
            limit: 1,
          })
        )[0]?.id;
      if (!content || content === 'seed') throw new Error('Make a content change first');
      return undo(store, content, 'actor-user');
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
          parent: null,
          target: null,
          order: null,
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
      changes = [await change(store, 'group', { parent: 'page-b', order: 'M' })];
    else if (action === 'deleteGroup') changes = [await change(store, 'group', { data: null })];
    else if (action === 'restoreGroup')
      changes = [await change(store, 'group', { data: { kind: 'group', title: 'Notes' } })];
    else {
      const contentId = `independent-${id}`;
      changes = [
        initial(contentId, { kind: 'paragraph', text: 'My own studio plan.' }),
        await change(store, 'appearance-a', {
          data: { kind: 'appearance' },
          parent: 'page-a',
          order: 'A',
          target: contentId,
        }),
      ];
    }
    const transaction = await store.commit({
      ...request(
        id,
        actionLabels[action],
        changes,
        action === 'move'
          ? nodeOperations.move
          : action === 'delete' || action === 'deleteGroup'
            ? nodeOperations.delete
            : action === 'restore' || action === 'restoreGroup'
              ? nodeOperations.restore
              : action === 'detach'
                ? nodeOperations.detach
                : action === 'independent'
                  ? nodeOperations.fork
                  : nodeOperations.update,
      ),
      recordedBy: action === 'commit' ? 'actor-agent' : 'actor-user',
      origin: activeExchange,
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
  if (accepted2.some((d) => d.node === 'conversation'))
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
    closure(deleted, 'page-a').some((v) => v.node === 'paragraph') ||
    !deleted.get('appearance-b')?.target
  )
    throw new Error('Deletion closure/reference behavior failed');
  await guide.execute('restore');
  const beforeMove = await store.snapshot();
  await guide.execute('move');
  const moved = await store.snapshot();
  if (
    moved.get('nested')?.transaction !== 'seed' ||
    !closure(moved, 'page-b').some((v) => v.node === 'nested')
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
      await change(store, 'page-a', { target: 'page-b' }),
      await change(store, 'page-b', { target: 'page-a' }),
    ]),
  );
  if (!closure(await store.snapshot(), 'page-a').length)
    throw new Error('Reference cycle did not terminate');
  let cycleRejected = false;
  try {
    await store.commit(
      request('containment-cycle', 'Invalid parent cycle', [
        await change(store, 'group', { parent: 'nested' }),
      ]),
    );
  } catch {
    cycleRejected = true;
  }
  if (!cycleRejected) throw new Error('Parent cycle accepted');
  await guide.execute('deleteGroup');
  const hidden = await store.snapshot();
  if (hidden.children('group').length || closure(hidden, 'page-b').some((v) => v.node === 'nested'))
    throw new Error('Deleted container retained visible descendants');
  if (hidden.get('nested')?.transaction !== 'seed')
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
    await undo(store, descendantEdit.id, 'actor-user');
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
  if (typeof send2 === 'string' || typeof edit === 'string')
    throw new Error('Expected accepted transactions');
  if (
    send2.recordedBy !== 'actor-user' ||
    edit.recordedBy !== 'actor-agent' ||
    edit.origin !== send2.origin
  )
    throw new Error('Authorship and context were conflated');
  const laterAuthor = await store.commit(
    request(
      'rename-author',
      'Rename the agent',
      [
        await change(store, 'actor-agent', {
          data: { kind: 'actor', role: 'agent', name: 'Renamed assistant' },
        }),
      ],
      spikeOperations.updateActor,
    ),
  );
  const authoredSnapshot = await store.snapshot(edit.sequence);
  if (authoredSnapshot.get(edit.recordedBy)?.data?.name !== 'Studio assistant')
    throw new Error('Historical author changed');
  await store.commit(
    request(
      'delete-author',
      'Remove the agent identity from current views',
      [await change(store, 'actor-agent', { data: null })],
      spikeOperations.deleteActor,
    ),
  );
  if (
    (await store.history({ kinds: [nodeOperations.update], limit: 100 })).find(
      (t) => t.id === edit.id,
    )?.recordedBy !== 'actor-agent'
  )
    throw new Error('Deleting an author erased attribution');
  const beforeInvalidMetadata = (await store.snapshot()).sequence;
  for (const [id, patch] of [
    ['missing-author', { recordedBy: '' }],
    ['unknown-author', { recordedBy: 'unknown' }],
    ['unknown-origin', { origin: 'unknown' }],
  ] as const) {
    let rejected = false;
    try {
      // biome-ignore lint/performance/noAwaitInLoops: Each invalid request must independently leave the log unchanged.
      await store.commit({ ...request(id, id, [dependent]), ...patch });
    } catch {
      rejected = true;
    }
    if (!rejected || (await store.snapshot()).sequence !== beforeInvalidMetadata)
      throw new Error('Invalid metadata published');
  }
  const custom = await store.commit({
    ...request(
      'custom-kind',
      'An import from a new feature',
      [dependent],
      spikeOperations.applyCalendarImport,
    ),
    message: null,
    metadata: { imported: 3, format: { name: 'calendar', version: 1 }, warnings: [] },
  });
  if (custom.metadata?.imported !== 3 || !Object.isFrozen(custom.metadata))
    throw new Error('Transaction metadata was lost or mutable');
  const malformed = structuredClone(request('missing-kind', 'Malformed operation', [dependent]));
  Reflect.set(malformed.kind, 'action', '');
  let malformedRejected = false;
  try {
    await store.commit(malformed);
  } catch {
    malformedRejected = true;
  }
  if (!malformedRejected) throw new Error('Malformed structured kind published');
  const changedMetadataRetry = {
    ...request(
      'custom-kind',
      'An import from a new feature',
      [dependent],
      spikeOperations.applyCalendarImport,
    ),
    message: null,
    metadata: { imported: 999 },
  };
  let metadataRetryRejected = false;
  try {
    await store.commit(changedMetadataRetry);
  } catch {
    metadataRetryRejected = true;
  }
  if (!metadataRetryRejected) throw new Error('Retry changed recorded metadata');
  const filtered = await store.history({
    kinds: [chatOperations.submit, spikeOperations.applyCalendarImport],
    limit: 100,
  });
  if (
    filtered.length !== 3 ||
    filtered[0]?.id !== custom.id ||
    filtered.some(
      (t) =>
        ![chatOperations.submit, spikeOperations.applyCalendarImport].some((kind) =>
          sameOperation(kind, t.kind),
        ),
    )
  )
    throw new Error('Extensible operation filtering failed');
  return {
    acceptedSubmissions: [send1, send2],
    secondSubmissionVersions: accepted2.map((d) => d.node),
    edit,
    contentSurvivedStop: true,
    transcriptSurvivedUndo: true,
    historicalText: historical.get('paragraph')?.data?.text,
    targetDeletionRetainedAppearances: true,
    descendantVersionAfterMove: moved.get('nested')?.transaction,
    oldGroupParent: beforeMove.get('group')?.parent,
    newGroupParent: moved.get('group')?.parent,
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
    attributedUserAndAgentWithSharedOrigin: true,
    historicalAuthorName: authoredSnapshot.get(edit.recordedBy)?.data?.name,
    deletedAuthorRetainedAttribution: true,
    invalidMetadataRejectedAtomically: true,
    extensibleKindWithNullMessage: custom.kind,
    immutableTransactionMetadata: custom.metadata,
    metadataRetryRejected,
    authorRenameSequence: laterAuthor.sequence,
    finalSequence: (await store.snapshot()).sequence,
  };
}

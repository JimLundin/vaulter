// PROTOTYPE: executable walkthrough actions and a small parity probe, shared by browser and CLI.
import type { NodeVersion, Transaction } from '../model.ts';
import type { NodeChange, NodeCommit } from '../store.ts';
import { chatOperations, type ChatData } from '../../documents/chat.ts';
import { nodeOperations, sameOperation } from '../operations.ts';
import { spikeOperations } from './operations.ts';
import { citationView, closure, undo, type SpikeStore } from './prototype.ts';

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
  placement: parent === null ? null : { parent, order: order! },
  connection:
    target === null ? null : { source: { node: parent ?? node }, target: { node: target } },
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
    placement: current.placement,
    connection: current.connection,
    data: current.data,
    expected: current.key.transaction,
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
  checkpoint: 'Record a response checkpoint',
  cite: 'Cite the shared paragraph',
  citeResponse: 'Cite the recorded response',
  reviseClaim: 'Record a revised claim',
  moveCitation: 'Move the citation',
  invalidAddress: 'Try an invalid exact reference',
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
    if (action === 'complete' || action === 'stop' || action === 'checkpoint') {
      if (!activeResponse) throw new Error('Send a message first');
      const original = (await store.snapshot()).get(activeResponse)!;
      if (original.data?.status !== 'running')
        throw new Error('This response has already finished');
      const data: NodeVersion['data'] = {
        kind: 'message',
        role: 'agent',
        at: String(original.data.at),
        status: action === 'stop' ? 'stopped' : action === 'checkpoint' ? 'running' : 'complete',
        parts:
          action === 'stop' && Array.isArray(original.data.parts) && original.data.parts.length
            ? original.data.parts
            : [
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
          action === 'stop'
            ? 'Record stopped response'
            : action === 'checkpoint'
              ? 'Record response checkpoint'
              : 'Record completed response',
          [await change(store, activeResponse, { data })],
          action === 'stop'
            ? chatOperations.stopResponse
            : action === 'checkpoint'
              ? chatOperations.checkpointResponse
              : chatOperations.completeResponse,
        ),
        recordedBy: 'actor-agent',
        origin: activeExchange,
      });
    }
    if (action === 'cite' || action === 'citeResponse') {
      const snapshot = await store.snapshot();
      const evidence = snapshot.get(action === 'cite' ? 'paragraph' : (activeResponse ?? ''));
      if (!evidence || evidence.data === null) throw new Error('Record evidence first');
      const { parts } = evidence.data;
      const text =
        typeof evidence.data.text === 'string'
          ? evidence.data.text
          : Array.isArray(parts)
            ? parts
                .filter((part) => part && typeof part === 'object' && 'text' in part)
                .map((part) =>
                  typeof part === 'object' && part !== null && 'text' in part ? part.text : '',
                )
                .join('')
            : '';
      if (!text) throw new Error('Record response text before citing it');
      if (snapshot.get('citation')) throw new Error('Reset before creating another demo citation');
      const accepted = await store.commit({
        ...request(
          id,
          'Record claim and citation to exact evidence',
          [
            initial(
              'claim',
              { kind: 'paragraph', text: 'This evidence supports the studio plan.' },
              'page-a',
              'Z',
            ),
            {
              ...initial(
                'citation',
                { kind: 'citation', range: { start: 0, end: text.length, unit: 'utf16' } },
                'claim',
                'A',
              ),
              connection: { source: { node: 'claim', transaction: id }, target: evidence.key },
            },
          ],
          spikeOperations.cite,
        ),
        origin: activeExchange,
      });
      lastContent = accepted.id;
      return accepted;
    }
    if (action === 'reviseClaim' || action === 'moveCitation') {
      const changes =
        action === 'reviseClaim'
          ? [
              await change(store, 'claim', {
                data: { kind: 'paragraph', text: 'A different claim requiring review.' },
              }),
            ]
          : [await change(store, 'citation', { placement: { parent: 'page-b', order: 'Z' } })];
      const accepted = await store.commit(
        request(
          id,
          actionLabels[action],
          changes,
          action === 'moveCitation' ? nodeOperations.move : nodeOperations.update,
        ),
      );
      lastContent = accepted.id;
      return accepted;
    }
    if (action === 'invalidAddress') {
      const snapshot = await store.snapshot();
      const before = snapshot.sequence;
      const validTransaction = (await store.history({ limit: 1 }))[0].id;
      // The user actor was recorded only by seed, not by this known transaction.
      try {
        await store.commit(
          request(id, 'Invalid exact pair and a page change', [
            await change(store, 'page-b', {
              data: { kind: 'document', title: 'Must not publish' },
            }),
            {
              ...initial(`bad-${id}`, { kind: 'reference' }),
              connection: {
                source: { node: 'page-a' },
                target: {
                  node: 'actor-user',
                  transaction: validTransaction === 'seed' ? id : validTransaction,
                },
              },
            },
          ]),
        );
      } catch (error) {
        if ((await store.snapshot()).sequence !== before)
          throw new Error('Partial invalid-address transaction published', { cause: error });
        return `Rejected atomically: ${String(error)}`;
      }
      throw new Error('Invalid exact pair was accepted');
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
          placement: null,
          connection: null,
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
      changes = [await change(store, 'group', { placement: { parent: 'page-b', order: 'M' } })];
    else if (action === 'deleteGroup') changes = [await change(store, 'group', { data: null })];
    else if (action === 'restoreGroup')
      changes = [await change(store, 'group', { data: { kind: 'group', title: 'Notes' } })];
    else {
      const contentId = `independent-${id}`;
      changes = [
        initial(contentId, { kind: 'paragraph', text: 'My own studio plan.' }),
        await change(store, 'appearance-a', {
          data: { kind: 'appearance' },
          placement: { parent: 'page-a', order: 'A' },
          connection: { source: { node: 'page-a' }, target: { node: contentId } },
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
    closure(deleted, 'page-a').some((v) => v.key.node === 'paragraph') ||
    !deleted.get('appearance-b')?.connection?.target
  )
    throw new Error('Deletion closure/reference behavior failed');
  await guide.execute('restore');
  const beforeMove = await store.snapshot();
  await guide.execute('move');
  const moved = await store.snapshot();
  if (
    moved.get('nested')?.key.transaction !== 'seed' ||
    !closure(moved, 'page-b').some((v) => v.key.node === 'nested')
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
      await change(store, 'page-a', {
        connection: { source: { node: 'page-a' }, target: { node: 'page-b' } },
      }),
      await change(store, 'page-b', {
        connection: { source: { node: 'page-b' }, target: { node: 'page-a' } },
      }),
    ]),
  );
  if (!closure(await store.snapshot(), 'page-a').length)
    throw new Error('Reference cycle did not terminate');
  let cycleRejected = false;
  try {
    await store.commit(
      request('containment-cycle', 'Invalid parent cycle', [
        await change(store, 'group', { placement: { parent: 'nested', order: 'M' } }),
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
    closure(hidden, 'page-b').some((v) => v.key.node === 'nested')
  )
    throw new Error('Deleted container retained visible descendants');
  if (hidden.get('nested')?.key.transaction !== 'seed')
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
  const citationTransaction = await guide.execute('cite');
  if (typeof citationTransaction === 'string') throw new Error('Expected citation acceptance');
  const citationSnapshot = await store.snapshot();
  const citation = citationSnapshot.get('citation')!;
  const sourceKey = citation.connection!.source;
  const targetKey = citation.connection!.target;
  const evidenceBefore = citationView(citationSnapshot, citation).quote;
  if (sourceKey.transaction !== citationTransaction.id || !citationSnapshot.resolve(sourceKey))
    throw new Error('Same-transaction exact source reference failed');
  if (
    !(
      Object.isFrozen(citation.key) &&
      Object.isFrozen(citation.connection?.target) &&
      Object.isFrozen(citation.placement)
    )
  )
    throw new Error('Nested structure is mutable');
  await guide.execute('commit');
  await guide.execute('reviseClaim');
  const changedSources = await store.snapshot();
  const notices = citationView(changedSources, citation);
  if (
    notices.quote !== evidenceBefore ||
    notices.source !== 'newer version in this view' ||
    notices.target !== 'newer version in this view' ||
    changedSources.get('citation')?.key.transaction !== citationTransaction.id
  )
    throw new Error('Citation evidence/source changed or citation was rewritten');
  if (changedSources.resolve({ node: targetKey.node })?.key.transaction === targetKey.transaction)
    throw new Error('Identity address failed to follow the snapshot');
  if (
    changedSources.resolve({ node: targetKey.node, transaction: citationTransaction.id }) !==
    undefined
  )
    throw new Error('Exact transaction was incorrectly treated as a snapshot cutoff');
  await guide.execute('delete');
  const deletedSources = await store.snapshot();
  if (
    citationView(deletedSources, citation).quote !== evidenceBefore ||
    citationView(deletedSources, citation).target !== 'deleted in this view'
  )
    throw new Error('Tombstone erased exact evidence or hid its status');
  const addressesInClosure = closure(deletedSources, 'page-a');
  if (
    !addressesInClosure.some(
      (v) => v.key.node === targetKey.node && v.key.transaction === targetKey.transaction,
    )
  )
    throw new Error('Exact evidence was hidden by its current tombstone');
  if (addressesInClosure.filter((v) => v.key.node === 'claim').length !== 1)
    throw new Error('Closure followed source backwards into the old claim');
  const movedCitation = await guide.execute('moveCitation');
  if (typeof movedCitation === 'string') throw new Error('Expected citation move');
  const afterCitationMove = (await store.snapshot()).get('citation')!;
  if (
    (await store.changes(movedCitation.id)).length !== 1 ||
    JSON.stringify(afterCitationMove.connection) !== JSON.stringify(citation.connection) ||
    afterCitationMove.placement?.parent !== 'page-b'
  )
    throw new Error('Moving the citation changed its relationship');
  const invalidExact = await guide.execute('invalidAddress');
  if (typeof invalidExact !== 'string' || !invalidExact.includes('Rejected atomically'))
    throw new Error('Invalid exact reference accepted');
  // Both current and historical versions of a node may occur in one closure.
  await guide.execute('restore');
  const mixed = closure(await store.snapshot(), 'page-b').filter((v) => v.key.node === 'paragraph');
  if (mixed.length !== 2) throw new Error('Closure collapsed distinct versions of one identity');
  // Same page key, different children: exact version selection does not freeze a subtree.
  const composedNow = await store.snapshot();
  const composedBefore = await store.snapshot(citationTransaction.sequence - 1);
  if (
    composedNow.get('page-a')?.key.transaction !== composedBefore.get('page-a')?.key.transaction ||
    composedNow.children('page-a').length === composedBefore.children('page-a').length
  )
    throw new Error('Composition boundary was not exercised');
  if (composedBefore.resolve(citation.key) !== undefined)
    throw new Error('Historical view exposed a future version');
  await guide.execute('send');
  const checkpoint = await guide.execute('checkpoint');
  if (typeof checkpoint === 'string') throw new Error('Expected checkpoint');
  const response = (await store.changes(checkpoint.id))[0].after;
  const responseCitation = await store.commit(
    request(
      'response-citation',
      'Cite response checkpoint',
      [
        initial(
          'response-claim',
          { kind: 'paragraph', text: 'Claim based on a response checkpoint.' },
          'page-a',
          'z',
        ),
        {
          ...initial(
            'response-citation',
            { kind: 'citation', range: { start: 0, end: 10, unit: 'utf16' } },
            'response-claim',
            'A',
          ),
          connection: {
            source: { node: 'response-claim', transaction: 'response-citation' },
            target: response.key,
          },
        },
      ],
      spikeOperations.cite,
    ),
  );
  await guide.execute('stop');
  const stopped = await store.snapshot();
  if (
    stopped.resolve(response.key)?.data?.status !== 'running' ||
    stopped.get(response.key.node)?.data?.status !== 'stopped' ||
    JSON.stringify(stopped.get(response.key.node)?.data?.parts) !==
      JSON.stringify(response.data?.parts)
  )
    throw new Error('Stop lost recorded partial output or changed the checkpoint');
  await undo(store, responseCitation.id, 'actor-user');
  const compensated = await store.snapshot();
  if (
    compensated.get('response-citation')?.data !== null ||
    compensated.get(response.key.node)?.data?.status !== 'stopped' ||
    !compensated.resolve({ node: 'response-citation', transaction: responseCitation.id })
  )
    throw new Error('Citation undo erased transcript or history');
  return {
    acceptedSubmissions: [send1, send2],
    secondSubmissionVersions: accepted2.map((d) => d.node),
    edit,
    contentSurvivedStop: true,
    transcriptSurvivedUndo: true,
    historicalText: historical.get('paragraph')?.data?.text,
    targetDeletionRetainedAppearances: true,
    descendantVersionAfterMove: moved.get('nested')?.key.transaction,
    oldGroupParent: beforeMove.get('group')?.placement?.parent,
    newGroupParent: moved.get('group')?.placement?.parent,
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
    exactCitation: { evidenceBefore, notices, targetKey, sourceKey },
    citationMovedWithoutChangingEndpoints: true,
    exactPairRejectedAtomically: true,
    exactAddressIsNotSnapshotCutoff: true,
    historicalSnapshotDoesNotExposeFutureVersion: true,
    closureRetainsDistinctVersionsOfOneNode: true,
    exactPageVersionDoesNotFreezeChildren: true,
    stoppedResponseRetainsCheckpointText: true,
    responseCitationUndoRetainsTranscriptAndHistory: true,
    finalSequence: (await store.snapshot()).sequence,
  };
}

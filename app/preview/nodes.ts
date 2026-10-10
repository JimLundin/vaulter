// Fictional preview only: replay accepted requests through the production memory adapter.
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import type { NodeCommit } from '../vault/nodes/store.ts';
import { frozen } from '../vault/nodes/json.ts';

export const previewJournalKey = 'vaulter:preview:accepted:v1';
export async function previewNodes(storage: Storage, scenario?: string) {
  const memory = memoryNodeBackend();
  const journal = JSON.parse(storage.getItem(previewJournalKey) ?? '[]') as NodeCommit[];
  for (const request of journal) {
    // biome-ignore lint/performance/noAwaitInLoops: accepted transaction order is definitive.
    await memory.commit(request);
  }
  let fault: string | undefined;
  const match = (request: NodeCommit) =>
    scenario === 'initial-save' || scenario === 'lost-response'
      ? request.kind.scope === 'chat' && request.kind.action === 'submit'
      : scenario === 'content-save' || scenario === 'content-lost-response'
        ? request.kind.scope === 'node' &&
          request.changes.some((change) => change.data?.kind === 'content')
        : scenario === 'outcome-save'
          ? request.kind.scope === 'agent' && request.kind.action === 'completeTool'
          : scenario === 'terminal-save'
            ? request.kind.scope === 'chat' && request.kind.action === 'completeResponse'
            : false;
  return {
    ...memory,
    commit: async (request: NodeCommit) => {
      const copy = frozen(structuredClone(request));
      const failing = !fault && match(copy);
      if (failing) fault = copy.id;
      if (failing && scenario !== 'lost-response' && scenario !== 'content-lost-response')
        throw new Error('The preview rejected this save once. Retry saving to continue.');
      const accepted = await memory.commit(copy);
      if (!journal.some((saved) => saved.id === copy.id)) {
        journal.push(copy);
        try {
          storage.setItem(previewJournalKey, JSON.stringify(journal));
        } catch {
          /* Accepted memory receipts stay authoritative if demo retention is unavailable. */
        }
      }
      if (failing)
        throw new Error(
          scenario === 'content-lost-response'
            ? 'The preview accepted content but lost its response. Retry content saving to reconcile.'
            : 'The preview accepted the message but lost its response. Retry saving to reconcile.',
        );
      return accepted;
    },
  };
}

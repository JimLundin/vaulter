import {
  ConflictError,
  createPersistentStorage,
  parseJournal,
  type Journal,
} from '@/vault/eav/index.ts';

export const previewEavKey = 'vaulter:preview:eav:dialogue:v1';
/** Fictional tab-local durability through the same EAV acceptance interface as production. */
export function previewEav(storage: Storage, scenario?: string) {
  let journal: Journal = parseJournal(
    JSON.parse(storage.getItem(previewEavKey) ?? '{"schemas":[],"commits":[]}'),
  );
  let fault = false;
  return createPersistentStorage({
    scope: previewEavKey,
    load: async () => journal,
    append: async (request) => {
      if (journal.commits.some((commit) => commit.id === request.commit.id)) return;
      if (request.base !== (journal.commits.at(-1)?.id ?? null)) throw new ConflictError();
      const matches = request.commit.facts.some((fact) => {
        if (scenario === 'initial-save' || scenario === 'lost-response')
          return fact.attribute === 'chat.exchange/submission';
        if (scenario === 'content-save' || scenario === 'content-lost-response')
          return (
            fact.attribute === 'wiki.page/title' && fact.added && fact.value === 'Preview thought'
          );
        if (scenario === 'outcome-save')
          return (
            fact.attribute === 'agent.toolExecution/status' &&
            !fact.added &&
            fact.value === 'running'
          );
        if (scenario === 'terminal-save')
          return fact.attribute === 'agent.run/status' && !fact.added && fact.value === 'running';
        return false;
      });
      const fail = !fault && matches;
      if (fail) fault = true;
      if (fail && scenario !== 'lost-response' && scenario !== 'content-lost-response')
        throw new Error('The preview rejected this save once. Retry saving to continue.');
      const next = parseJournal({
        schemas: request.schemas,
        commits: [...journal.commits, request.commit],
      });
      storage.setItem(previewEavKey, JSON.stringify(next));
      journal = next;
      if (fail)
        throw new Error(
          scenario === 'content-lost-response'
            ? 'The preview accepted content but lost its response. Retry content saving to reconcile.'
            : 'The preview accepted the message but lost its response. Retry saving to reconcile.',
        );
    },
    clear: () => {
      storage.removeItem(previewEavKey);
      return Promise.resolve();
    },
  });
}

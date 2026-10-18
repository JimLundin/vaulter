import {
  createPersistentStorage,
  type AppendRequest,
  type Journal,
} from '@/application/store/index.ts';

/** Transport gates exercise admission and save recovery through EAV's publication boundary. */
export function controlledChatStorage(beforeAppend: (request: AppendRequest) => Promise<void>) {
  let journal: Journal = { schemas: [], commits: [] };
  return createPersistentStorage({
    scope: crypto.randomUUID(),
    load: async () => journal,
    append: async (request) => {
      await beforeAppend(request);
      journal = {
        schemas: request.schemas,
        commits: [...journal.commits, request.commit],
      };
    },
  });
}

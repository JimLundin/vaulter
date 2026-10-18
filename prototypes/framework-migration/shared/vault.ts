/** THROWAWAY: real owner behavior, fictional in-memory Vault, no credentials or remote writes. */
import { e, openDatabase, createMemoryStorage } from '@/core/store/index.ts';
import { wikiSchema } from '@/modules/wiki/records.ts';
import { readEavWiki } from '@/modules/wiki/pages.ts';
import { taskEntities } from '@/modules/tasks/records.ts';
import { createTask, reviseTask, type TaskStatus } from '@/modules/tasks/operations.ts';
import { readTasks } from '@/modules/tasks/reading.ts';
import { chatSchema } from '@/modules/conversation/records.ts';
import { createConversation } from '@/modules/conversation/conversation.ts';
import { eavChatFactory } from '@/modules/conversation/eav-backend.ts';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

const schema = e.registry({ ...wikiSchema, ...chatSchema, ...taskEntities });
export async function createPrototypeVault() {
  const db = await openDatabase({ schema, storage: createMemoryStorage() });
  let modelCalls = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      modelCalls++;
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return { stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'This response was recorded by the existing Agent and Conversation modules. Navigation did not restart the run.' },
        { type: 'text-end', id: 'text' },
        { type: 'finish', finishReason: { unified: 'stop', raw: undefined }, usage: {
          inputTokens: { total: 8, noCache: 8, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 16, text: 16, reasoning: 0 },
        } },
      ]) };
    },
  });
  const conversation = createConversation({
    backend: eavChatFactory(Promise.resolve(db)), session: {},
    user: 'prototype-user', agent: 'prototype-agent', provider: 'scripted',
    selectedModel: 'prototype-model', instructions: 'Answer using the fictional prototype Vault.',
    model: async () => model,
  });
  async function createPage(title: string) {
    const key = crypto.randomUUID();
    await db.transaction(async (tx) => {
      const page = await tx.entities.wikiPages.insert({ key, title, summary: 'A runtime-created Record in the real typed EAV Store.', aliases: [], available: true, createdAt: new Date() });
      const content = await tx.entities.wikiContent.insert({ key: crypto.randomUUID(), kind: 'paragraph', text: 'The page was accepted after application startup. Both routers resolve its identity without rebuilding.', available: true });
      await tx.entities.wikiAppearances.insert({ key: crypto.randomUUID(), content, page, order: 'a', available: true });
    });
    return key;
  }
  await createPage('A browser-owned Vault');
  await createPage('Migration notebook');
  await createTask(db, { title: 'Compare route ownership', description: 'Change status through the existing Tasks module.', status: 'ready' });
  await conversation.restore();
  async function read() {
    const [pages, tasks, transactions] = await Promise.all([
      readEavWiki(db), readTasks(db), db.history.transactions.query({ select: {}, limit: null }),
    ]);
    return { pages, tasks, transactions: transactions.length };
  }
  return {
    db, conversation, read, createPage,
    createTask: (title: string) => createTask(db, { title, description: '', status: 'backlog' }),
    reviseTask: (task: Parameters<typeof reviseTask>[1], status: TaskStatus) => reviseTask(db, task, { status }),
    diagnostics: () => ({ modelCalls }),
    dispose() { conversation.dispose(); void db[Symbol.asyncDispose](); },
  };
}
export type PrototypeVault = Awaited<ReturnType<typeof createPrototypeVault>>;
export type VaultReading = Awaited<ReturnType<PrototypeVault['read']>>;
export const emptyReading: VaultReading = { pages: [], tasks: [], transactions: 0 };

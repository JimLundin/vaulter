import { openDatabase, createMemoryStorage } from '@/application/store/index.ts';
import { chatSchema } from './records.ts';
import { eavChatFactory } from './eav-backend.ts';

/** A native dialogue database shared by controllers in one Vault session. */
export async function chatFixture(storage = createMemoryStorage()) {
  const db = await openDatabase({ schema: chatSchema, storage });
  const options = {
    database: Promise.resolve(db),
    backend: eavChatFactory(Promise.resolve(db)),
    session: {},
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Keep a reliable record.',
    model: () => Promise.reject(new Error('No execution expected')),
  };
  return { db, options };
}

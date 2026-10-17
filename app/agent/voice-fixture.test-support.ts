import { tool } from 'ai';
import { vi } from 'vitest';
import { z } from 'zod';
import type { MemoryStorage } from '@/vault/eav/index.ts';
import { createMemoryStorage, e, openDatabase } from '@/vault/eav/index.ts';
import { agentEntities } from './data/schema.ts';
import type { AgentToolFactory } from './tools.ts';

const Note = e.entity('voice.fixture.note', { text: e.string() });
const schema = e.registry({ ...agentEntities, notes: Note });
/** Native persistence and an independent content producer for voice behavior checks. */
export async function voiceFixture(storage: MemoryStorage = createMemoryStorage()) {
  const db = await openDatabase({ schema, storage });
  const refs = await db.transaction(async (tx) => {
    const user = await tx.entities.actors.insert({ name: 'User', kind: 'user' });
    const actor = await tx.entities.actors.insert({ name: 'Agent', kind: 'agent' });
    const definition = await tx.entities.toolDefinitions.insert({
      name: 'captureParagraph',
      version: '1',
    });
    const agent = await tx.entities.agents.insert({
      actor,
      provider: 'fictional',
      model: 'voice-model',
      instructions: 'Capture paragraphs.',
      settings: {},
      tools: [definition],
    });
    return { user, agent };
  });
  const effects = vi.fn();
  const tools: AgentToolFactory = (context) => ({
    captureParagraph: tool({
      inputSchema: z.object({ text: z.string().transform((text) => `note:${text}`) }),
      execute: async ({ text }) => {
        context.signal.throwIfAborted();
        if (!(context.author && context.run)) throw new Error('Accepted invocation required');
        effects();
        await db.transaction({ author: context.author, origin: context.run }, async (tx) => {
          await tx.entities.notes.insert({ text });
        });
        return { text };
      },
    }),
  });
  return { db, ...refs, effects, tools };
}

import {
  ConflictError,
  SaveError,
  type Database,
  type EntityRef,
  type EntityDefinition,
  type JsonValue,
} from '@/vault/eav/index.ts';
import type { agentSchema, AgentRunRef, ModelStepRef } from '@/agent/data/schema.ts';

/** Request admission and response acceptance, without an execution-resume scheduler. */
export function modelSteps(options: {
  db: Pick<Database<typeof agentSchema>, 'transaction'>;
  run: AgentRunRef;
  author: EntityRef<EntityDefinition>;
  configuration: JsonValue;
  failed: (error: unknown) => void;
}) {
  let current: ModelStepRef | undefined;
  let pending: (() => Promise<void>) | undefined;
  const retain = async (write: () => Promise<unknown>) => {
    try {
      await write();
    } catch (error) {
      if (!(error instanceof SaveError || error instanceof ConflictError)) throw error;
      let failure: unknown = error;
      pending = async () => {
        try {
          if (failure instanceof SaveError) await failure.retry();
          else if (failure instanceof ConflictError) await write();
          else throw failure;
        } catch (next) {
          failure = next;
          throw next;
        }
      };
      options.failed(error);
      throw error;
    }
  };
  return {
    current: () => current,
    pending: () => !!pending,
    before: async (input: JsonValue) => {
      const startedAt = new Date();
      await retain(() =>
        options.db.transaction({ author: options.author, origin: options.run }, async (tx) => {
          const run = await tx.entities.agentRuns.get(options.run, { select: { status: true } });
          if (run?.status !== 'running') throw new Error('Model step requires a running Agent');
          const last = await tx.entities.modelSteps.first({
            where: { run: { eq: options.run } },
            select: { position: true, status: true },
            orderBy: [{ position: 'desc' }],
          });
          if (last?.status === 'running') throw new Error('A model step is still pending');
          current = await tx.entities.modelSteps.insert({
            run: options.run,
            position: (last?.position ?? -1) + 1,
            startedAt,
            status: 'running',
            inputFormat: 'ai-sdk-model-messages-v7',
            input,
            configuration: options.configuration,
          });
        }),
      );
    },
    after: async (response: JsonValue) => {
      if (!current) throw new Error('Model response has no accepted request');
      const step = current;
      const endedAt = new Date();
      await retain(() =>
        options.db.transaction({ author: options.author, origin: options.run }, async (tx) => {
          const accepted = await tx.entities.modelSteps.get(step, { select: { status: true } });
          if (accepted?.status !== 'running') throw new Error('Model response is already recorded');
          await tx.entities.modelSteps.update({ ...step, status: 'complete', endedAt, response });
        }),
      );
    },
    stopOpen: async (error?: JsonValue) => {
      if (!current || pending) return;
      const step = current;
      const endedAt = new Date();
      await retain(() =>
        options.db.transaction({ author: options.author, origin: options.run }, async (tx) => {
          const accepted = await tx.entities.modelSteps.get(step, { select: { status: true } });
          if (accepted?.status !== 'running') return;
          await tx.entities.modelSteps.update({
            ...step,
            status: error ? 'failed' : 'stopped',
            endedAt,
            ...(error && { error }),
          });
        }),
      );
    },
    retry: async () => {
      const attempt = pending;
      if (!attempt) return;
      await attempt();
      pending = undefined;
    },
  };
}

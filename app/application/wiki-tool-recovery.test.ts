import { expect, test } from 'vitest';
import { e, openDatabase, createPersistentStorage, type Journal } from '@/vault/eav/index.ts';
import { agentEntities } from '@/agent/data/schema.ts';
import { startAgentRun } from '@/agent/data/operations.ts';
import { eavTools } from '@/agent/eav/tools.ts';
import { wikiSchema } from '@/workflows/wiki/data/schema.ts';
import { wikiTools } from '@/workflows/wiki/data/tools.ts';

for (const stop of [false, true]) {
  test(`Wiki side-effect save recovery preserves one publication and canonical outcome${stop ? ' after stop' : ''}`, async () => {
    const schema = e.registry({ ...wikiSchema, ...agentEntities });
    let journal: Journal = { schemas: [], commits: [] };
    let loseResponse = true;
    await using db = await openDatabase({
      schema,
      storage: createPersistentStorage({
        scope: 'wiki-tool-recovery',
        load: async () => structuredClone(journal),
        append: async (request) => {
          if (!journal.commits.some((commit) => commit.id === request.commit.id))
            journal = structuredClone({
              schemas: request.schemas,
              commits: [...journal.commits, request.commit],
            });
          if (
            loseResponse &&
            request.commit.facts.some((fact) => fact.attribute === 'wiki.page/title')
          ) {
            loseResponse = false;
            throw new Error('Accepted publication acknowledgement lost');
          }
        },
      }),
    });
    const {
      author,
      run,
      tools: enabled,
    } = await db.transaction(async (tx) => {
      const author = await tx.entities.actors.insert({ name: 'Writer', kind: 'agent' });
      const capability = await tx.entities.toolDefinitions.insert({
        name: 'createWikiPage',
        version: '1',
      });
      const agent = await tx.entities.agents.insert({
        actor: author,
        provider: 'test',
        model: 'test',
        instructions: '',
        settings: {},
        tools: [capability],
      });
      return { author, ...(await startAgentRun(tx, { agent, startedAt: new Date(), inputs: [] })) };
    });
    const abort = new AbortController();
    const native = wikiTools(db, { author, origin: run, signal: abort.signal });
    let notifyPaused!: () => void;
    const paused = new Promise<void>((resolve) => {
      notifyPaused = resolve;
    });
    const owner = eavTools({
      db,
      run,
      author,
      enabled,
      signal: abort.signal,
      tools: { createWikiPage: native.createWikiPage },
      check: () => abort.signal.throwIfAborted(),
      execution: () => {},
      changed: () => {},
      paused: () => notifyPaused(),
      recovered: () => {},
      halt: () => {},
    });
    const execute = owner.tools.createWikiPage!.execute!;
    const input = { key: 'once', title: 'Once', summary: '' };
    const context = { toolCallId: 'create', messages: [], context: {} };
    const effect = execute(input, context);
    const settled = Promise.resolve(effect).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await paused;
    expect(owner.pending()?.retryable).toBe(true);
    if (stop) abort.abort();
    await owner.retrySave();
    if (stop) expect(await settled).toHaveProperty('error');
    else {
      expect(await settled).toEqual({ value: { accepted: true, recovered: true } });
      expect(await execute(input, context)).toEqual({ accepted: true, recovered: true });
    }
    await owner.settle();
    expect(await db.entities.wikiPages.query({ select: { title: true } })).toMatchObject([
      { title: 'Once' },
    ]);
    expect(
      await db.entities.toolExecutions.query({ select: { status: true, output: true } }),
    ).toMatchObject([{ status: 'complete', output: { accepted: true, recovered: true } }]);
    expect(
      journal.commits.filter((commit) =>
        commit.facts.some((fact) => fact.attribute === 'wiki.page/title'),
      ),
    ).toHaveLength(1);
  });
}

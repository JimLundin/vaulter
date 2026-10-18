import { expect, test, vi } from 'vitest';
import { e, openDatabase, createPersistentStorage, type Journal } from '@/core/store/index.ts';
import { agentEntities } from '@/modules/agent/records.ts';
import { startAgentRun } from '@/modules/agent/operations.ts';
import { eavTools } from '@/modules/agent/execution/tools.ts';
import { wikiSchema } from '@/modules/wiki/records.ts';
import { wikiTools } from '@/modules/wiki/tools.ts';

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
          await Promise.resolve();
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
      const attribution = await tx.entities.actors.insert({ name: 'Writer', kind: 'agent' });
      const capability = await tx.entities.toolDefinitions.insert({
        name: 'createWikiPage',
        version: '1',
      });
      const agent = await tx.entities.agents.insert({
        actor: attribution,
        provider: 'test',
        model: 'test',
        instructions: '',
        settings: {},
        tools: [capability],
      });
      return {
        author: attribution,
        ...(await startAgentRun(tx, { agent, startedAt: new Date(), inputs: [] })),
      };
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
      changed: vi.fn(),
      paused: vi.fn(),
      contentFailed: () => notifyPaused(),
      recovered: vi.fn(),
      halt: vi.fn(),
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
    expect(owner.contentPending()).toBe(true);
    expect(owner.pending()).toBeUndefined();
    if (stop) abort.abort();
    await owner.retryContentSave();
    expect(await settled).toHaveProperty('error');
    expect(owner.contentPending()).toBe(false);
    await expect(execute(input, context)).rejects.toThrow();
    await owner.settle();
    expect(await db.entities.wikiPages.query({ select: { title: true } })).toMatchObject([
      { title: 'Once' },
    ]);
    expect(
      await db.entities.toolExecutions.query({
        select: { status: true, output: true, error: true },
      }),
    ).toMatchObject([{ status: 'failed', error: { code: 'contentSaveUncertain' } }]);
    expect(
      (await db.entities.toolExecutions.first({ select: { output: true } }))?.output,
    ).toBeUndefined();
    expect(
      journal.commits.filter((commit) =>
        commit.facts.some((fact) => fact.attribute === 'wiki.page/title'),
      ),
    ).toHaveLength(1);
  });
}

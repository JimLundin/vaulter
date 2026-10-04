import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineContract, satisfies } from './contract.ts';
import type { Kernel } from './kernel.ts';
import { resolve } from './resolve.ts';
import { secretStore } from './secrets.ts';
import { memoryKeep, startTree } from './testing.ts';

// Fixture source: compiled and loaded like any extension in the repo.
const NOTES = `
import { defineContract } from '@pip/kernel';
import { z } from 'zod';
export interface NotesV1 {
  append(text: string): Promise<number>;
  count(): Promise<number>;
  onAppended(handler: (text: string) => void): Promise<() => void>;
}
export const notes = defineContract<NotesV1>({
  name: 'notes',
  version: '1.1.0',
  inputs: { append: z.tuple([z.string().min(1)]) },
});`;

const NOTES_CONFORMANCE = `
import { defineConformance } from '@pip/kernel';
import { notes } from './index.ts';
export default defineConformance(notes, [
  { name: 'counts what was appended', async run(n, t) {
    t.equal(await n.count(), 0);
    await n.append('a');
    t.equal(await n.count(), 1);
  } },
  { name: 'refuses an empty note', async run(n, t) { await t.rejects(n.append('')); } },
]);`;

// Notes, kept in the kernel's storage for this extension.
const NOTES_EXT = `
import { defineExtension } from '@pip/kernel';
import { notes } from '@contracts/notes';
export default defineExtension({
  id: 'notes', version: '1.0.0', provides: { notes },
  setup(_, kernel) {
    const handlers = new Set<(t: string) => void>();
    return { notes: {
      async append(text: string) {
        if (!text) throw new Error('empty');
        const n = ((await kernel.storage.get<number>('n')) ?? 0) + 1;
        await kernel.storage.set('n', n);
        await kernel.storage.set('note:' + n, text);
        for (const h of handlers) await h(text);
        return n;
      },
      count: async () => (await kernel.storage.get<number>('n')) ?? 0,
      async onAppended(h: (t: string) => void) { handlers.add(h); return () => { handlers.delete(h); }; },
    } };
  },
});`;

// A requirer that subscribes and appends.
const VOICE_EXT = `
import { defineExtension } from '@pip/kernel';
import { notes } from '@contracts/notes';
export default defineExtension({
  id: 'voice', version: '1.0.0', requires: { notes },
  async setup({ notes }, kernel) {
    await notes.onAppended(async (t) => {
      const seen = (await kernel.storage.get<string[]>('seen')) ?? [];
      await kernel.storage.set('seen', [...seen, t]);
    });
    await notes.append('from voice');
  },
});`;

const TOOLS = `
import { defineContract } from '@pip/kernel';
export interface Tool { name: string; run: (input: unknown) => Promise<unknown> }
export interface ToolsV1 { add(tool: Tool): Promise<void>; call(name: string, input: unknown): Promise<unknown> }
export const tools = defineContract<ToolsV1>({ name: 'agent.tools', version: '1.0.0' });`;

const AGENT_EXT = `
import { defineExtension } from '@pip/kernel';
import { tools } from '@contracts/agent.tools';
export default defineExtension({
  id: 'agent', version: '1.0.0', provides: { tools },
  setup() {
    const all = new Map();
    return { tools: {
      async add(t) { all.set(t.name, t); },
      async call(name, input) { return all.get(name).run(input); },
    } };
  },
});`;

const toolExt = (access: string) => `
import { defineExtension, guarded } from '@pip/kernel';
import { tools } from '@contracts/agent.tools';
export default defineExtension({
  id: 'workouts', version: '0.1.0', requires: { tools },
  async setup({ tools }) {
    await tools.add({ name: 'merge', run: guarded(async (x) => 'merged ' + x, { label: 'tool:merge', access: '${access}' }) });
  },
});`;

const notesContract = defineContract<{
  append: (t: string) => Promise<number>;
  count: () => Promise<number>;
}>({ name: 'notes', version: '1.1.0' });
const toolsContract = defineContract<{ call: (name: string, input: unknown) => Promise<unknown> }>({
  name: 'agent.tools',
  version: '1.0.0',
});

const base = {
  'contracts/notes/index.ts': NOTES,
  'contracts/notes/conformance.ts': NOTES_CONFORMANCE,
  'extensions/notes/index.ts': NOTES_EXT,
};
const tooling = (access: string) => ({
  'contracts/agent.tools/index.ts': TOOLS,
  'extensions/agent/index.ts': AGENT_EXT,
  'extensions/workouts/index.ts': toolExt(access),
});

let kernels: Kernel[] = [];
const start = async (...args: Parameters<typeof startTree>) => {
  const r = await startTree(...args);
  kernels.push(r.kernel);
  return r;
};
afterEach(async () => {
  await Promise.all(kernels.map((k) => k.dispose()));
  kernels = [];
});

describe('contracts', () => {
  it('are keyed by name and major version', () => {
    expect(defineContract({ name: 'ui.shell', version: '1.2.0' }).key).toBe('ui.shell@1');
    expect(() => defineContract({ name: 'Records', version: '1.0.0' })).toThrow();
    expect(() => defineContract({ name: 'records', version: '1' })).toThrow();
  });
  it('are satisfied by the same major at the same or a later minor', () => {
    expect(satisfies('1.2.0', '1.1.5')).toBe(true);
    expect(satisfies('1.1.4', '1.1.5')).toBe(false);
    expect(satisfies('2.0.0', '1.1.0')).toBe(false);
  });
});

describe('resolve', () => {
  const ref = (name: string, version = '1.0.0') => ({ kind: 'contract', name, version });
  const ext = (id: string, more: object = {}) => ({
    folder: id,
    statics: { id, version: '1.0.0', ...more },
  });

  it('orders an extension after what it requires, and derives contract keys itself', () => {
    const r = resolve([
      ext('voice', { requires: { notes: ref('notes') } }),
      ext('notes', { provides: { notes: { ...ref('notes'), key: 'forged@9' } } }),
    ]);
    expect(r.refused).toEqual([]);
    expect(r.accepted.map((a) => a.id)).toEqual(['notes', 'voice']);
    expect(r.accepted[0].statics.provides.notes.key).toBe('notes@1');
  });

  it('refuses bad static fields, an id that is not its folder, and what needed them', () => {
    const r = resolve([
      { folder: 'bad', statics: { id: 'Bad Id', version: 'one' } },
      {
        folder: 'other',
        statics: { id: 'notes', version: '1.0.0', provides: { notes: ref('notes') } },
      },
      ext('voice', { requires: { notes: ref('notes') } }),
      ext('map'),
    ]);
    expect(r.accepted.map((a) => a.id)).toEqual(['map']);
    const by = Object.fromEntries(r.refused.map((x) => [x.id, x.problems.join(' / ')]));
    expect(by.bad).toMatch(/id:.*version:/);
    expect(by.other).toMatch(/must be its folder's name/);
    expect(by.voice).toBe('requires notes@1, which nothing installed provides');
  });

  it('refuses an outdated provider, doubled providers (unless chosen), and cycles', () => {
    const voice = ext('voice', { requires: { notes: ref('notes', '1.1.0') } });
    const old = resolve([voice, ext('notes', { provides: { notes: ref('notes') } })]);
    expect(old.refused[0].problems).toEqual(['requires notes 1.1.0; notes provides 1.0.0']);
    const two = [
      voice,
      ...['a', 'b'].map((id) => ext(id, { provides: { notes: ref('notes', '1.1.0') } })),
    ];
    expect(resolve(two).refused[0].problems[0]).toMatch(/choose one/);
    const chosen = resolve(two, { 'notes@1': 'b' });
    expect(chosen.accepted.find((a) => a.id === 'voice')?.wiring).toEqual({ notes: 'b' });
    const cyc = resolve([
      ext('x', { provides: { a: ref('a') }, requires: { b: ref('b') } }),
      ext('y', { provides: { b: ref('b') }, requires: { a: ref('a') } }),
    ]);
    expect(cyc.accepted).toEqual([]);
    expect(cyc.refused.flatMap((f) => f.problems)).toEqual([
      'a cycle: x → y → x',
      'a cycle: x → y → x',
    ]);
  });
});

describe('the kernel', () => {
  it('loads each extension and routes calls and callbacks between them', async () => {
    const { kernel, storage, refused } = await start({
      ...base,
      'extensions/voice/index.ts': VOICE_EXT,
    });
    expect(refused).toEqual([]);
    expect(kernel.running().map((r) => r.id)).toEqual(['notes', 'voice']);
    const n = kernel.use(notesContract);
    expect(await n.count()).toBe(1);
    await n.append('from the kernel');
    // Voice's handler was called back through the kernel.
    expect(await storage.get('voice', 'seen')).toEqual(['from voice', 'from the kernel']);
    // Each extension's storage is its own namespace.
    expect(await storage.get('notes', 'note:2')).toBe('from the kernel');
    expect(await storage.get('voice', 'n')).toBeUndefined();
  });

  it("checks a call against the contract's inputs", async () => {
    const { kernel } = await start(base);
    await expect(kernel.use(notesContract).append('')).rejects.toThrow(
      /kernel → notes@1\.append: 0/,
    );
  });

  it('refuses an extension whose setup fails, and what requires it, but starts the rest', async () => {
    const { kernel, refused } = await start({
      ...base,
      'extensions/notes/index.ts': `import { defineExtension } from '@pip/kernel';
        import { notes } from '@contracts/notes';
        export default defineExtension({ id: 'notes', version: '1.0.0', provides: { notes },
          setup() { throw new Error('broken'); } });`,
      'extensions/voice/index.ts': VOICE_EXT,
      'extensions/map/index.ts': `import { defineExtension } from '@pip/kernel';
        export default defineExtension({ id: 'map', version: '1.0.0', setup() {} });`,
    });
    expect(kernel.running().map((r) => r.id)).toEqual(['map']);
    expect(refused).toEqual([
      { id: 'notes', problems: ['setup failed: broken'] },
      { id: 'voice', problems: ['notes could not start'] },
    ]);
  });

  it("refuses a provider that fails its contract's conformance suite", async () => {
    const lax = NOTES_EXT.replace("if (!text) throw new Error('empty');", '').replace(
      'provides: { notes },',
      'provides: { notes: { ...notes, inputs: {} } },',
    );
    const { refused } = await start({ ...base, 'extensions/notes/index.ts': lax });
    expect(refused[0].problems[0]).toMatch(/notes@1 conformance: refuses an empty note/);
  });

  it('runs conformance on a scratch instance whose data is dropped', async () => {
    const { kernel, storage, refused } = await start(base);
    expect(refused).toEqual([]);
    expect(kernel.running().map((r) => r.id)).toEqual(['notes']);
    expect(await storage.list('notes~conformance', '')).toEqual([]);
    expect(await storage.get('notes', 'n')).toBeUndefined();
  });

  it("applies Pip's access to a guarded callback: read runs, write is logged, ask waits", async () => {
    const read = await start(tooling('read'));
    expect(await read.kernel.use(toolsContract).call('merge', 'a')).toBe('merged a');
    expect(await read.kernel.policy.audit()).toEqual([]);

    const write = await start(tooling('write'));
    await write.kernel.use(toolsContract).call('merge', 'b');
    expect((await write.kernel.policy.audit()).map((e) => [e.to, e.label, e.outcome])).toEqual([
      ['workouts', 'tool:merge', 'done'],
    ]);

    const ask = await start(tooling('ask'));
    const t = ask.kernel.use(toolsContract);
    const pending = t.call('merge', 'c');
    await vi.waitFor(() => expect(ask.kernel.policy.approvals()).toHaveLength(1));
    const [a] = ask.kernel.policy.approvals();
    expect(a).toMatchObject({ from: 'agent', to: 'workouts', label: 'tool:merge', args: ['c'] });
    ask.kernel.policy.decide(a.id, true);
    expect(await pending).toBe('merged c');
    const declined = t.call('merge', 'd');
    await vi.waitFor(() => expect(ask.kernel.policy.approvals()).toHaveLength(1));
    ask.kernel.policy.decide(ask.kernel.policy.approvals()[0].id, false);
    await expect(declined).rejects.toThrow(/declined/);
  });

  it("follows the person's setting over the declared level", async () => {
    const { kernel } = await start(tooling('read'), {
      access: () => ({ 'workouts/tool:merge': 'ask' }),
    });
    void kernel.use(toolsContract).call('merge', 'x');
    await vi.waitFor(() => expect(kernel.policy.approvals()).toHaveLength(1));
    expect([...kernel.policy.known.values()]).toEqual([
      { ext: 'workouts', label: 'tool:merge', declared: 'read' },
    ]);
  });

  it('fetches for an extension, attaching its secret only for its hosts', async () => {
    const secrets = secretStore(memoryKeep());
    await secrets.set('openai', 'key', 'sk-123');
    const seen: [string, string | null][] = [];
    const fetchImpl = ((url: string, init?: RequestInit) => {
      seen.push([String(url), new Headers(init?.headers).get('Authorization')]);
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    }) as typeof fetch;
    const { kernel, refused } = await start(
      {
        'contracts/probe/index.ts': `import { defineContract } from '@pip/kernel';
          export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
        'extensions/openai/index.ts': `import { defineExtension } from '@pip/kernel';
          import { probe } from '@contracts/probe';
          export default defineExtension({ id: 'openai', version: '1.0.0', provides: { probe },
            secrets: { key: { label: 'OpenAI key', hosts: ['api.openai.com'] } },
            permissions: { network: ['example.org'] },
            setup(_, kernel) { return { probe: { async run() {
              const r = await kernel.fetch('https://api.openai.com/v1/models', { secret: 'key' });
              const errors = [];
              for (const [u, init] of [['https://evil.test/'], ['https://example.org/', { secret: 'key' }], ['http://api.openai.com/']]) {
                try { await kernel.fetch(u, init); } catch (e) { errors.push(e.message); }
              }
              return { body: await r.json(), has: await kernel.hasSecret('key'), errors };
            } } }; },
          });`,
      },
      { secrets, fetch: fetchImpl },
    );
    expect(refused).toEqual([]);
    const probe = defineContract<{ run: () => Promise<unknown> }>({
      name: 'probe',
      version: '1.0.0',
    });
    const out = (await kernel.use(probe).run()) as {
      body: unknown;
      has: boolean;
      errors: string[];
    };
    expect(out.body).toEqual({ ok: true });
    expect(out.has).toBe(true);
    expect(seen).toEqual([['https://api.openai.com/v1/models', 'Bearer sk-123']]);
    expect(out.errors).toEqual([
      'openai: evil.test is not among its declared hosts',
      'openai: the secret "key" is not for example.org',
      'openai: only https requests (http://api.openai.com)',
    ]);
  });

  it('removes an extension with its data', async () => {
    const { kernel, storage } = await start({ ...base, 'extensions/voice/index.ts': VOICE_EXT });
    expect(await storage.get('voice', 'seen')).toEqual(['from voice']);
    await kernel.remove('voice');
    expect(await storage.get('voice', 'seen')).toBeUndefined();
    expect(kernel.running().map((r) => r.id)).toEqual(['notes']);
  });

  it("lets a contract's personal methods through only right after a person acted in the caller", async () => {
    const answers: string[] = [];
    const ask = defineContract<{
      ask: (q: string) => Promise<void>;
      answer: (a: string) => Promise<void>;
    }>({
      name: 'questions',
      version: '1.0.0',
      personal: ['answer'],
    });
    let present = '';
    const { kernel, refused } = await start(
      {
        'contracts/questions/index.ts': `import { defineContract } from '@pip/kernel';
          export const questions = defineContract<{ ask(q: string): Promise<void>; answer(a: string): Promise<void> }>({
            name: 'questions', version: '1.0.0', personal: ['answer'] });`,
        'contracts/probe/index.ts': `import { defineContract } from '@pip/kernel';
          export const probe = defineContract<{ run(): Promise<string[]> }>({ name: 'probe', version: '1.0.0' });`,
        'extensions/pip/index.ts': `import { defineExtension } from '@pip/kernel';
          import { questions } from '@contracts/questions';
          import { probe } from '@contracts/probe';
          export default defineExtension({ id: 'pip', version: '1.0.0', requires: { questions }, provides: { probe },
            setup({ questions }) { return { probe: { async run() {
              const out = [];
              await questions.ask('which Ada?');
              try { await questions.answer('the first'); out.push('answered'); } catch (e) { out.push(e.message); }
              return out;
            } } }; } });`,
      },
      {
        provide: [
          [ask, { ask: async () => undefined, answer: async (a: string) => void answers.push(a) }],
        ],
        userPresent: (caller) => caller === present,
      },
    );
    expect(refused).toEqual([]);
    const probe = kernel.use(
      defineContract<{ run: () => Promise<string[]> }>({ name: 'probe', version: '1.0.0' }),
    );
    expect(await probe.run()).toEqual([
      'questions@1.answer is for a person to do, right after a tap or key',
    ]);
    present = 'pip';
    expect(await probe.run()).toEqual(['answered']);
    expect(answers).toEqual(['the first']);
  });

  it('starts an extension without an optional contract nothing provides, and with it when present', async () => {
    const user = `import { defineExtension } from '@pip/kernel';
      import { notes } from '@contracts/notes';
      export default defineExtension({ id: 'wiki', version: '1.0.0', optional: { notes },
        async setup({ notes }, kernel) {
          await kernel.storage.set('had', notes ? await notes.count() : 'none');
        } });`;
    const without = await start({
      'contracts/notes/index.ts': NOTES,
      'extensions/wiki/index.ts': user,
    });
    expect(without.refused).toEqual([]);
    expect(await without.storage.get('wiki', 'had')).toBe('none');

    const withIt = await start({ ...base, 'extensions/wiki/index.ts': user });
    expect(withIt.refused).toEqual([]);
    expect(await withIt.storage.get('wiki', 'had')).toBe(0);

    const broken = await start({
      ...base,
      'extensions/notes/index.ts': NOTES_EXT.replace(
        'setup(_, kernel) {',
        "setup(_, kernel) { throw new Error('down');",
      ),
      'extensions/wiki/index.ts': user,
    });
    expect(broken.kernel.running().map((r) => r.id)).toEqual(['wiki']);
    expect(await broken.storage.get('wiki', 'had')).toBe('none');
  });
});

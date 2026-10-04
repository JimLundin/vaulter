import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineContract, satisfies } from './contract.ts';
import { readStatics, Statics } from './extension.ts';
import type { Kernel } from './kernel.ts';
import { resolve } from './resolve.ts';
import { secretStore } from './secrets.ts';
import { memoryKeep, startTree } from './testing.ts';

// Fixture source: compiled and loaded like any extension in the repo.
const NOTES = `
import { defineContract } from '@vaulter/kernel';
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

// Notes, kept in the kernel's storage for this extension.
const NOTES_EXT = `
import { defineExtension } from '@vaulter/kernel';
import { out } from '@vaulter/test';
import { notes } from '@contracts/notes';
export default defineExtension({
  id: 'notes', version: '1.0.0', provides: { notes },
  setup(_, kernel) {
    const handlers = new Set<(t: string) => void>();
    return { notes: {
      async append(text: string) {
        if (!text) throw new Error('empty');
        const n = ((await out.get('notes', 'n')) ?? 0) + 1;
        await out.set('notes', 'n', n);
        await out.set('notes', 'note:' + n, text);
        for (const h of handlers) await h(text);
        return n;
      },
      count: async () => (await out.get('notes', 'n')) ?? 0,
      async onAppended(h: (t: string) => void) { handlers.add(h); return () => { handlers.delete(h); }; },
    } };
  },
});`;

// A requirer that subscribes and appends.
const VOICE_EXT = `
import { defineExtension } from '@vaulter/kernel';
import { out } from '@vaulter/test';
import { notes } from '@contracts/notes';
export default defineExtension({
  id: 'voice', version: '1.0.0', requires: { notes },
  async setup({ notes }, kernel) {
    await notes.onAppended(async (t) => {
      const seen = (await out.get('voice', 'seen')) ?? [];
      await out.set('voice', 'seen', [...seen, t]);
    });
    await notes.append('from voice');
  },
});`;

const TOOLS = `
import { defineContract } from '@vaulter/kernel';
export interface Tool { name: string; access: 'read' | 'write' | 'ask'; run: (input: unknown) => Promise<unknown> }
export interface ToolsV1 {
  add(tool: Tool): Promise<void>;
  call(name: string, input: unknown): Promise<unknown>;
  level(name: string): Promise<string>;
}
export const tools = defineContract<ToolsV1>({ name: 'agent.tools', version: '1.0.0', guards: {
  add: { arg: 0, fn: 'run', guard: (t) => ({ label: 'tool:' + t.name, access: t.access }) },
} });`;

const AGENT_EXT = `
import { defineExtension } from '@vaulter/kernel';
import { tools } from '@contracts/agent.tools';
export default defineExtension({
  id: 'agent', version: '1.0.0', provides: { tools },
  setup() {
    const all = new Map();
    return { tools: {
      async add(t) { all.set(t.name, t); },
      async call(name, input) { return all.get(name).run(input); },
      async level(name) { return all.get(name).run.level; },
    } };
  },
});`;

const toolExt = (access: string) => `
import { defineExtension } from '@vaulter/kernel';
import { tools } from '@contracts/agent.tools';
export default defineExtension({
  id: 'workouts', version: '0.1.0', requires: { tools },
  async setup({ tools }) {
    await tools.add({ name: 'merge', access: '${access}', run: async (x) => 'merged ' + x });
  },
});`;

// A draft that brings its own copy of the contract, without the guard on a tool.
const SNEAKY = `
import { defineContract, defineExtension } from '@vaulter/kernel';
const tools = defineContract({ name: 'agent.tools', version: '1.0.0' });
export default defineExtension({
  id: 'workouts', version: '0.1.0', requires: { tools },
  async setup({ tools }) {
    await tools.add({ name: 'merge', access: 'ask', run: async (x) => 'merged ' + x });
  },
});`;

const notesContract = defineContract<{
  append: (t: string) => Promise<number>;
  count: () => Promise<number>;
}>({ name: 'notes', version: '1.1.0' });
const toolsContract = defineContract<{
  call: (name: string, input: unknown) => Promise<unknown>;
  level: (name: string) => Promise<string>;
}>({
  name: 'agent.tools',
  version: '1.0.0',
});

const base = {
  'contracts/notes/index.ts': NOTES,
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
    id,
    statics: Statics.parse({ id, version: '1.0.0', ...more }),
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

  it('reads static fields once: every bad field, and an id that is not its folder', () => {
    const def = (fields: object) => ({ ...fields, setup() {} }) as never;
    expect(() => readStatics('bad', def({ id: 'Bad Id', version: 'one' }))).toThrow(
      /id:.*; version:/,
    );
    expect(() => readStatics('other', def({ id: 'notes', version: '1.0.0' }))).toThrow(
      /must be its folder's name/,
    );
    expect(() => readStatics('kernel', def({ id: 'kernel', version: '1.0.0' }))).toThrow(
      /the kernel's own id/,
    );
  });

  it('refuses what requires a contract nothing provides, and starts the rest', () => {
    const r = resolve([ext('voice', { requires: { notes: ref('notes') } }), ext('map')]);
    expect(r.accepted.map((a) => a.id)).toEqual(['map']);
    expect(r.refused).toEqual([
      { id: 'voice', problems: ['requires notes@1, which nothing installed provides'] },
    ]);
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

  it("checks a call against the contract's inputs, when it gives any", async () => {
    const { kernel } = await start(base);
    await expect(kernel.use(notesContract).append('')).rejects.toThrow(
      /kernel → notes@1\.append: 0/,
    );
  });

  it('refuses an extension whose setup fails, and what requires it, but starts the rest', async () => {
    const { kernel, refused } = await start({
      ...base,
      'extensions/notes/index.ts': `import { defineExtension } from '@vaulter/kernel';
        import { notes } from '@contracts/notes';
        export default defineExtension({ id: 'notes', version: '1.0.0', provides: { notes },
          setup() { throw new Error('broken'); } });`,
      'extensions/voice/index.ts': VOICE_EXT,
      'extensions/map/index.ts': `import { defineExtension } from '@vaulter/kernel';
        export default defineExtension({ id: 'map', version: '1.0.0', setup() {} });`,
    });
    expect(kernel.running().map((r) => r.id)).toEqual(['map']);
    expect(refused).toEqual([
      { id: 'notes', problems: ['setup failed: broken'] },
      { id: 'voice', problems: ['notes could not start'] },
    ]);
  });

  it('gives a caller that is not an extension real handles, until it is dropped', async () => {
    const { kernel } = await start(base);
    const caller = kernel.caller('check-1');
    const n = caller.use(notesContract, 'notes');
    expect(await n.append('from a check')).toBe(1);
    await expect(n.append('')).rejects.toThrow(/check-1 → notes@1\.append/);
    await caller.drop();
    await expect(n.append('again')).rejects.toThrow(/check-1 is not running/);
  });

  it("applies Vaulter's access to a guarded callback: read runs, write is logged, ask waits", async () => {
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

  it("guards a tool by the provider's contract, whatever copy of it the requirer has", async () => {
    const { kernel, refused } = await start({
      ...tooling('read'),
      'extensions/workouts/index.ts': SNEAKY,
    });
    expect(refused).toEqual([]);
    void kernel.use(toolsContract).call('merge', 'x');
    await vi.waitFor(() => expect(kernel.policy.approvals()).toHaveLength(1));
  });

  it("follows the person's setting over the declared level, and tells the holder", async () => {
    const { kernel, booted } = await start(tooling('read'), {
      access: { 'workouts/tool:merge': 'ask' },
    });
    expect(await kernel.use(toolsContract).level('merge')).toBe('ask');
    void kernel.use(toolsContract).call('merge', 'x');
    await vi.waitFor(() => expect(kernel.policy.approvals()).toHaveLength(1));
    expect([...kernel.policy.known.values()]).toEqual([
      { ext: 'workouts', label: 'tool:merge', declared: 'read' },
    ]);
    await booted.config.setAccess('workouts', 'tool:merge', null);
    expect(await kernel.use(toolsContract).level('merge')).toBe('read');
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
        'contracts/probe/index.ts': `import { defineContract } from '@vaulter/kernel';
          export const probe = defineContract<{ run(): Promise<unknown> }>({ name: 'probe', version: '1.0.0' });`,
        'extensions/openai/index.ts': `import { defineExtension } from '@vaulter/kernel';
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

  it('removes an extension: its secrets go, and its handles refuse', async () => {
    const secrets = secretStore(memoryKeep());
    await secrets.set('voice', 'token', 'pk.1');
    const voice = VOICE_EXT.replace(
      "id: 'voice', version: '1.0.0', requires: { notes },",
      "id: 'voice', version: '1.0.0', requires: { notes }, secrets: { token: { label: 'T', hosts: ['api.example.com'] } },",
    );
    const { kernel } = await start({ ...base, 'extensions/voice/index.ts': voice }, { secrets });
    await kernel.remove('voice');
    expect(await secrets.has('voice', 'token')).toBe(false);
    expect(kernel.running().map((r) => r.id)).toEqual(['notes']);
  });

  it("never lets Vaulter's own extensions make a personal call, even right after a tap", async () => {
    const questions = defineContract<{ answer: (a: string) => Promise<void> }>({
      name: 'questions',
      version: '1.0.0',
      personal: ['answer'],
    });
    const caller = (
      id: string,
      statics: string,
      imports = '',
    ) => `import { defineExtension } from '@vaulter/kernel';
    import { out } from '@vaulter/test';
      import { questions } from '@contracts/questions';
      ${imports}
      export default defineExtension({ id: '${id}', version: '1.0.0', requires: { questions }, ${statics}
        async setup({ questions }, kernel) {
          try { await questions.answer('yes'); await out.set('${id}', 'out', 'answered'); }
          catch (e) { await out.set('${id}', 'out', e.message); }
          return ${id === 'agent' ? '{ agent: {} }' : 'undefined'};
        } });`;
    const { storage, refused } = await start(
      {
        'contracts/questions/index.ts': `import { defineContract } from '@vaulter/kernel';
          export const questions = defineContract({ name: 'questions', version: '1.0.0', personal: ['answer'] });`,
        'contracts/agent/index.ts': `import { defineContract } from '@vaulter/kernel';
          export const agent = defineContract({ name: 'agent', version: '1.0.0' });`,
        'extensions/agent/index.ts': caller(
          'agent',
          'provides: { agent },',
          "import { agent } from '@contracts/agent';",
        ),
        'extensions/workouts/index.ts': caller(
          'workouts',
          "author: { kind: 'agent', reason: 'runs' },",
        ),
        'extensions/settings/index.ts': caller('settings', ''),
      },
      {
        provide: [[questions, { answer: async () => undefined }]],
        presence: { grant() {}, take: () => true },
      },
    );
    expect(refused).toEqual([]);
    expect(await storage.get('agent', 'out')).toMatch(
      /is for a person to do; agent is the agent's own/,
    );
    expect(await storage.get('workouts', 'out')).toMatch(/workouts is the agent's own/);
    expect(await storage.get('settings', 'out')).toBe('answered');
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
        'contracts/questions/index.ts': `import { defineContract } from '@vaulter/kernel';
          export const questions = defineContract<{ ask(q: string): Promise<void>; answer(a: string): Promise<void> }>({
            name: 'questions', version: '1.0.0', personal: ['answer'] });`,
        'contracts/probe/index.ts': `import { defineContract } from '@vaulter/kernel';
          export const probe = defineContract<{ run(): Promise<string[]> }>({ name: 'probe', version: '1.0.0' });`,
        'extensions/asker/index.ts': `import { defineExtension } from '@vaulter/kernel';
          import { questions } from '@contracts/questions';
          import { probe } from '@contracts/probe';
          export default defineExtension({ id: 'asker', version: '1.0.0', requires: { questions }, provides: { probe },
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
        presence: { grant() {}, take: (caller) => caller === present },
      },
    );
    expect(refused).toEqual([]);
    const probe = kernel.use(
      defineContract<{ run: () => Promise<string[]> }>({ name: 'probe', version: '1.0.0' }),
    );
    expect(await probe.run()).toEqual([
      'questions@1.answer is for a person to do, right after a tap or key',
    ]);
    present = 'asker';
    expect(await probe.run()).toEqual(['answered']);
    expect(answers).toEqual(['the first']);
  });

  it('starts an extension without an optional contract nothing provides, and with it when present', async () => {
    const user = `import { defineExtension } from '@vaulter/kernel';
    import { out } from '@vaulter/test';
      import { notes } from '@contracts/notes';
      export default defineExtension({ id: 'wiki', version: '1.0.0', optional: { notes },
        async setup({ notes }, kernel) {
          await out.set('wiki', 'had', notes ? await notes.count() : 'none');
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

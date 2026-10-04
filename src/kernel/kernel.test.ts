import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { defineContract, satisfies } from './contract.ts';
import { defineExtension, Statics } from './extension.ts';
import { boot } from './kernel.ts';
import { resolve } from './resolve.ts';
import { kernelApi, type KernelKeep, secretStore } from './secrets.ts';

interface NotesV1 {
  append: (note: { text: string }) => Promise<number>;
  count: () => number;
}
const notes = defineContract<NotesV1>({
  name: 'notes',
  version: '1.1.0',
  inputs: { append: z.tuple([z.object({ text: z.string().min(1) })]) },
});
const notesOld = defineContract<NotesV1>({ name: 'notes', version: '1.0.0' });
const notesNext = defineContract<NotesV1>({ name: 'notes', version: '1.2.0' });
const shell = defineContract<{ slots: { bar: string }; add: (id: string) => void }>({
  name: 'ui.shell',
  version: '1.0.0',
});

const memKeep = (): KernelKeep => {
  const m = new Map<string, unknown>();
  return {
    get: async <T>(id: string) => m.get(id) as T | undefined,
    set: (id, v) => {
      m.set(id, v);
      return Promise.resolve();
    },
    del: (id) => {
      m.delete(id);
      return Promise.resolve();
    },
  };
};

const notesExt = (version = notes) =>
  defineExtension({
    id: 'notes',
    version: '1.0.0',
    provides: { notes: version },
    setup() {
      const log: string[] = [];
      return {
        notes: {
          append: async ({ text }) => log.push(text),
          count: () => log.length,
        },
      };
    },
  });

const as = (...exts: unknown[]) => exts.map((ext, i) => ({ origin: `extensions/${i}`, ext }));

describe('contracts', () => {
  it('are keyed by name and major version', () => {
    expect(notes.key).toBe('notes@1');
    expect(shell.key).toBe('ui.shell@1');
    expect(() => defineContract({ name: 'Records', version: '1.0.0' })).toThrow();
    expect(() => defineContract({ name: 'records', version: '1' })).toThrow();
  });
  it('are satisfied by the same major at the same or a later minor', () => {
    expect(satisfies('1.2.0', '1.1.5')).toBe(true);
    expect(satisfies('1.1.5', '1.1.5')).toBe(true);
    expect(satisfies('1.1.4', '1.1.5')).toBe(false);
    expect(satisfies('1.0.9', '1.1.0')).toBe(false);
    expect(satisfies('2.0.0', '1.1.0')).toBe(false);
  });
});

describe('resolve', () => {
  const voice = defineExtension({
    id: 'voice',
    version: '1.0.0',
    requires: { notes },
    setup: () => undefined,
  });

  it('orders an extension after what it requires', () => {
    const r = resolve(as(voice, notesExt()));
    expect(r.refused).toEqual([]);
    expect(r.accepted.map((a) => a.id)).toEqual(['notes', 'voice']);
    expect(r.accepted[1].wiring).toEqual({ notes: 'notes' });
  });

  it('refuses a definition that fails its static checks, before running anything', () => {
    const setup = vi.fn();
    const bad = defineExtension({ id: 'Bad Id', version: 'one', setup });
    const r = resolve(as(bad, { not: 'an extension' }));
    expect(r.accepted).toEqual([]);
    expect(r.refused.map((x) => x.id)).toEqual(['Bad Id', 'extensions/1']);
    expect(r.refused[0].problems.join()).toMatch(/id:.*version:/s);
    expect(setup).not.toHaveBeenCalled();
  });

  it('refuses what has no provider, and what needed it, but keeps the rest', () => {
    const uses = defineExtension({
      id: 'today',
      version: '1.0.0',
      requires: { notes },
      setup: () => undefined,
    });
    const alone = defineExtension({ id: 'map', version: '1.0.0', setup: () => undefined });
    const r = resolve(as(voice, uses, alone));
    expect(r.accepted.map((a) => a.id)).toEqual(['map']);
    expect(r.refused.find((x) => x.id === 'voice')?.problems).toEqual([
      'requires notes@1, which nothing installed provides',
    ]);
  });

  it('refuses a provider older than the requirer was built against', () => {
    const r = resolve(as(voice, notesExt(notesOld)));
    expect(r.refused[0].problems).toEqual(['requires notes 1.1.0; notes provides 1.0.0']);
    expect(resolve(as(voice, notesExt(notesNext))).refused).toEqual([]);
  });

  it('asks to choose between two providers of a contract', () => {
    const other = defineExtension({
      id: 'notes-b',
      version: '1.0.0',
      provides: { notes },
      setup: () => ({ notes: { append: async () => 0, count: () => 0 } }),
    });
    expect(resolve(as(voice, notesExt(), other)).refused[0].problems[0]).toMatch(/choose one/);
    const chosen = resolve(as(voice, notesExt(), other), { 'notes@1': 'notes-b' });
    expect(chosen.accepted.find((a) => a.id === 'voice')?.wiring).toEqual({ notes: 'notes-b' });
  });

  it('refuses every member of a cycle', () => {
    const a = defineContract<object>({ name: 'a', version: '1.0.0' });
    const b = defineContract<object>({ name: 'b', version: '1.0.0' });
    const x = defineExtension({
      id: 'x',
      version: '1.0.0',
      provides: { a },
      requires: { b },
      setup: () => ({ a: {} }),
    });
    const y = defineExtension({
      id: 'y',
      version: '1.0.0',
      provides: { b },
      requires: { a },
      setup: () => ({ b: {} }),
    });
    const r = resolve(as(x, y));
    expect(r.accepted).toEqual([]);
    expect(r.refused.flatMap((f) => f.problems)).toEqual([
      'a cycle: x → y → x',
      'a cycle: x → y → x',
    ]);
  });
});

describe('boot and the broker', () => {
  const opts = () => ({ secrets: secretStore(memKeep()) });

  it('hands each extension brokered handles for what it requires', async () => {
    let seen: NotesV1 | undefined;
    const voice = defineExtension({
      id: 'voice',
      version: '1.0.0',
      requires: { notes },
      async setup(ctx) {
        seen = ctx.notes;
        await ctx.notes.append({ text: 'hello' });
      },
    });
    const b = await boot(as(voice, notesExt()), opts());
    expect(b.refused).toEqual([]);
    expect(seen?.count()).toBe(1);
    // A handle can't be changed by the requirer.
    expect(() => {
      (seen as unknown as Record<string, unknown>).count = () => 99;
    }).toThrow();
  });

  it("checks every call against the contract's inputs", async () => {
    const voice = defineExtension({
      id: 'voice',
      version: '1.0.0',
      requires: { notes },
      async setup(ctx) {
        await ctx.notes.append({ text: '' });
      },
    });
    const b = await boot(as(voice, notesExt()), opts());
    expect(b.refused[0].problems[0]).toMatch(/voice → notes@1\.append: 0\.text/);
  });

  it('passes every call through the gate, with who called', async () => {
    const calls: string[] = [];
    const agent = defineExtension({
      id: 'agent',
      version: '1.0.0',
      requires: { notes },
      setup(ctx) {
        ctx.notes.count();
        expect(() => ctx.notes.append({ text: 'x' })).toThrow('not allowed');
      },
    });
    const b = await boot(as(agent, notesExt()), {
      ...opts(),
      gate: (c) => {
        calls.push(`${c.from}→${c.to} ${c.contract}.${c.method}`);
        if (c.method === 'append') throw new Error('not allowed');
      },
    });
    expect(b.refused).toEqual([]);
    expect(calls).toEqual(['agent→notes notes@1.count', 'agent→notes notes@1.append']);
  });

  it('passes constants on a contract through unbrokered', async () => {
    const shellExt = defineExtension({
      id: 'shell-desktop',
      version: '1.0.0',
      provides: { shell },
      setup: () => ({ shell: { slots: { bar: 'bar' }, add: () => undefined } }),
    });
    let slot = '';
    const user = defineExtension({
      id: 'user',
      version: '1.0.0',
      requires: { shell },
      setup(ctx) {
        slot = ctx.shell.slots.bar;
        ctx.shell.add('x');
      },
    });
    await boot(as(user, shellExt), opts());
    expect(slot).toBe('bar');
  });

  it('leaves out a provider whose setup fails, and what needed it', async () => {
    const broken = defineExtension({
      id: 'notes',
      version: '1.0.0',
      provides: { notes },
      setup: () => ({ notes: { count: () => 0 } }) as never,
    });
    const voice = defineExtension({
      id: 'voice',
      version: '1.0.0',
      requires: { notes },
      setup: () => undefined,
    });
    const map = defineExtension({ id: 'map', version: '1.0.0', setup: () => undefined });
    const b = await boot(as(broken, voice, map), opts());
    expect(b.running.map((r) => r.id)).toEqual(['map']);
    expect(b.refused).toEqual([
      { id: 'notes', problems: ['setup failed: notes@1 is missing append'] },
      { id: 'voice', problems: ['notes could not start'] },
    ]);
  });
});

describe('secrets', () => {
  const statics = Statics.parse({
    id: 'openai',
    version: '1.0.0',
    permissions: { network: ['example.org'] },
    secrets: { key: { label: 'OpenAI key', hosts: ['api.openai.com'] } },
  });

  it('are stored encrypted and read back only by the kernel', async () => {
    const keep = memKeep();
    const s = secretStore(keep);
    await s.set('openai', 'key', 'sk-123');
    expect(JSON.stringify(await keep.get('secret:openai/key'))).not.toContain('sk-123');
    expect(await s.reveal('openai', 'key')).toBe('sk-123');
    expect(await s.reveal('other', 'key')).toBeUndefined();
  });

  it('are attached only to requests for their declared hosts', async () => {
    const s = secretStore(memKeep());
    await s.set('openai', 'key', 'sk-123');
    const f = vi.fn(async () => new Response('ok'));
    const api = kernelApi(statics, s, f);

    await api.fetch('https://api.openai.com/v1/models', { secret: 'key' });
    const headers = (f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer sk-123');

    await api.fetch('https://example.org/x');
    await expect(api.fetch('https://example.org/x', { secret: 'key' })).rejects.toThrow(
      /not for example\.org/,
    );
    await expect(api.fetch('https://evil.test/x')).rejects.toThrow(/not among its declared hosts/);
    await expect(api.fetch('http://api.openai.com/')).rejects.toThrow(/only https/);
    await expect(api.fetch('https://api.openai.com/', { secret: 'other' })).rejects.toThrow(
      /no secret named/,
    );
    expect(await api.hasSecret('key')).toBe(true);
  });
});

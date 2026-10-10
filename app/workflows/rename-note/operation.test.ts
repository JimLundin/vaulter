import { expect, test } from 'vitest';
import { renameNote } from './index.ts';
import { renameTools } from './agent.ts';
import { liveVault } from '../../vault/index.ts';
import { writerCore, type Overlay, type Writer } from '../../vault/changes/writer.ts';
import { memoryBackend } from '../../vault/storage/memory.ts';
import { vaultRules } from '../../vault/validation/rules.ts';
import { SCHEMA } from '../../vault/documents/notes/schema.fixture.ts';
import type { VaultBackend } from '../../vault/storage/backend.ts';

const note = (title: string, body = '') =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n${body}\n\n## See also\n`;
async function setup(keep?: VaultBackend['keep']) {
  const memory = memoryBackend({
    ...SCHEMA,
    'Alpha.md': note('Alpha'),
    'Beta.md': note('Beta', 'See [Alpha](</Alpha.md>).'),
  });
  let head = (await memory.backend.refresh())!;
  const backend = { ...memory.backend, keep: keep ?? memory.backend.keep };
  const updates: (Overlay | null)[] = [];
  const core = writerCore(
    backend,
    vaultRules,
    () => head.files,
    (next) => {
      head = next;
    },
    (overlay) => updates.push(overlay),
  );
  const writer = (): Writer => ({
    base: head.files,
    overlay: core.overlay,
    stage: core.stage,
    stageMany: core.stageMany,
    update: core.update,
    write: core.write,
    unstage: core.unstage,
    discard: core.discard,
    commit: core.commit,
    revert: core.revert,
    history: backend.history,
    patch: backend.patch,
    current: () => ({ base: head.files, overlay: core.overlay }),
    problems: core.problems,
  });
  return { ...memory, vault: liveVault(writer), core, updates };
}
test('rename stages the move and reference rewrites together, persists one overlay and commits through the permanent rules', async () => {
  const { vault, backend, files, updates } = await setup();
  await renameNote(vault, { from: 'Alpha.md', to: 'Gamma.md' });
  expect(updates).toHaveLength(1);
  expect(vault.files().find((file) => file.path === 'Beta.md')?.text).toContain('</Gamma.md>');
  expect(vault.files().some((file) => file.path === 'Alpha.md')).toBe(false);
  expect(files().some((file) => file.path === 'Alpha.md')).toBe(true);
  expect(await backend.keep.get('overlay')).toEqual(updates[0]);
  expect(await vault.problems()).toEqual([]);
  await vault.commit!('Rename Alpha');
  expect(files().some((file) => file.path === 'Gamma.md')).toBe(true);
});
test('a persistence failure publishes none of a rename, and leaves the next operation usable', async () => {
  let fail = true;
  const keep = {
    get: async <T>() => null as T | null,
    set: async () => {
      if (fail) throw new Error('storage full');
    },
  };
  const { vault, updates } = await setup(keep);
  await expect(renameNote(vault, { from: 'Alpha.md', to: 'Gamma.md' })).rejects.toThrow(
    'storage full',
  );
  expect(vault.staged()).toEqual([]);
  expect(updates).toEqual([]);
  expect(vault.files().find((file) => file.path === 'Beta.md')?.text).toContain('</Alpha.md>');
  fail = false;
  await renameNote(vault, { from: 'Alpha.md', to: 'Gamma.md' });
  expect(vault.files().some((file) => file.path === 'Gamma.md')).toBe(true);
});
test('the model adapter calls the same operation and reports task errors', async () => {
  const { vault } = await setup();
  const tool = renameTools(vault).renameNote;
  const execute = tool.execute!;
  const options = { toolCallId: 'rename', messages: [], context: undefined };
  expect(await execute({ from: 'Missing.md', to: 'Gamma.md' }, options)).toHaveProperty('error');
  expect(vault.staged()).toEqual([]);
  expect(await execute({ from: 'Alpha.md', to: 'Gamma.md' }, options)).toHaveProperty('staged');
});

test('rename calculates its changes after an earlier pending edit is persisted', async () => {
  const { vault, backend } = await setup();
  const keep = backend.keep.set;
  let entered!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  backend.keep.set = async (id, value) => {
    entered();
    await waiting;
    await keep(id, value);
  };
  const latest = note('Alpha', 'The latest edit must survive.');
  const editing = vault.stage('Alpha.md', latest);
  await started;
  const renaming = renameNote(vault, { from: 'Alpha.md', to: 'Gamma.md' });
  release();
  await Promise.all([editing, renaming]);
  expect(vault.files().find((file) => file.path === 'Gamma.md')?.text).toBe(latest);
});

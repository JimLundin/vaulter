import { expect, test } from 'vitest';
import { memoryBackend } from '../storage/memory.ts';
import { CheckFailed, Conflict, type Head } from '../storage/backend.ts';
import { writerCore, type Overlay } from './writer.ts';
import { StagedChanges, type OwnedVault } from './operations.ts';
import { vaultRules as RULES } from '../validation/rules.ts';

import { SCHEMA } from '../documents/notes/schema.fixture.ts';

const NOTE = (title: string, extra = '') =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n${extra}\n\n## See also\n`;

async function setup() {
  const m = memoryBackend({
    ...SCHEMA,
    'Alpha.md': NOTE('Alpha'),
    'Beta.md': NOTE('Beta', 'See [Alpha](</Alpha.md>).'),
  });
  let head = (await m.backend.refresh())!;
  const w = writerCore(
    m.backend,
    RULES,
    () => head.files,
    (h: Head) => {
      head = h;
    },
  );
  return { ...m, w };
}

test('staging, then one commit for every staged file; the overlay is kept by the backend', async () => {
  const { w, backend, files } = await setup();
  await w.stage('Gamma.md', NOTE('Gamma', 'From [Alpha](</Alpha.md>).'));
  await w.stage('Alpha.md', NOTE('Alpha', 'See [Gamma](</Gamma.md>).'));
  expect(Object.keys((await backend.keep.get<Overlay>('overlay'))!.files)).toEqual([
    'Gamma.md',
    'Alpha.md',
  ]);
  await w.commit!('vaulter: Gamma');
  expect(files().find((f) => f.path === 'Gamma.md')?.text).toContain('# Gamma');
  expect((await backend.history!()).length).toBe(1);
  expect(w.overlay).toBeNull();
});

test('staging the original text again unstages it', async () => {
  const { w } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'x'));
  await w.stage('Alpha.md', NOTE('Alpha'));
  expect(w.overlay).toBeNull();
});

test('staging is refused for a path that is not a vault file, or deleting a file that does not exist', async () => {
  const { w } = await setup();
  await expect(w.stage('notes/Gamma.md', NOTE('Gamma'))).rejects.toThrow(
    /isn't a file the app keeps/,
  );
  await expect(w.stage('Nobody.md', null)).rejects.toThrow(/no such file: Nobody.md/);
  expect(w.overlay).toBeNull();
  // A new file staged, then deleted: unstaged.
  await w.stage('Gamma.md', NOTE('Gamma'));
  await w.stage('Gamma.md', null);
  expect(w.overlay).toBeNull();
});

test('a commit with nothing staged is refused', async () => {
  const { w } = await setup();
  await expect(w.commit!('empty')).rejects.toThrow('nothing is staged');
});

test('a commit that adds a problem is refused; nothing is written', async () => {
  const { w, backend } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'See [Nobody](</Nobody.md>).'));
  await expect(w.commit!('broken')).rejects.toThrow(CheckFailed);
  expect(await backend.history!()).toEqual([]);
});

test('a file changed on the vault since it was staged is a conflict, for any backend', async () => {
  const m = memoryBackend({ 'Alpha.md': NOTE('Alpha') });
  let head = (await m.backend.refresh())!;
  const w = writerCore(
    m.backend,
    RULES,
    () => head.files,
    (h) => {
      head = h;
    },
  );
  await w.stage('Alpha.md', NOTE('Alpha', 'mine'));
  m.push({ 'Alpha.md': NOTE('Alpha', 'theirs') });
  head = (await m.backend.refresh())!;
  await expect(w.commit!('mine')).rejects.toThrow(Conflict);
  expect(m.files()[0].text).toContain('theirs');
});

test('revert undoes a step as a new step', async () => {
  const { w, files, backend } = await setup();
  await w.stage('Alpha.md', NOTE('Alpha', 'changed'));
  const sha = await w.commit!('change');
  await w.revert!(sha);
  expect(files().find((f) => f.path === 'Alpha.md')?.text).toBe(NOTE('Alpha'));
  expect((await backend.history!())[0].message).toMatch(/^Revert "change"/);
});

test('commit queued after staging and a later edit never loses either change', async () => {
  const { w, files } = await setup();
  const first = w.stage('Alpha.md', NOTE('Alpha', 'first'));
  const committed = w.commit!('first');
  const laterEdit = w.stage('Alpha.md', NOTE('Alpha', 'second'));
  await Promise.all([first, committed, laterEdit]);
  expect(files().find((file) => file.path === 'Alpha.md')?.text).toContain('first');
  expect(w.overlay?.files['Alpha.md']).toContain('second');
  await w.commit!('second');
  expect(files().find((file) => file.path === 'Alpha.md')?.text).toContain('second');
});

test("writers sharing a backend preserve each other's persisted staging", async () => {
  const { backend, w, files } = await setup();
  let head = { files: files(), version: '' };
  const other = writerCore(
    backend,
    RULES,
    () => head.files,
    (next) => {
      head = next;
    },
  );
  await Promise.all([w.load(), other.load()]);
  await w.stage('meta/first.md', '# First');
  await other.stage('meta/second.md', '# Second');
  expect(Object.keys((await backend.keep.get<Overlay>('overlay'))!.files)).toEqual([
    'meta/first.md',
    'meta/second.md',
  ]);
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

test('a sequence owns reading through commit; a waiting writer reloads the committed head', async () => {
  const { backend, w, files } = await setup();
  let head = { files: files(), version: '' };
  const other = writerCore(
    backend,
    RULES,
    () => head.files,
    (next) => {
      head = next;
    },
  );
  const entered = deferred();
  const release = deferred();
  const sequence = w.write(
    async (vault) => {
      await vault.stage('Alpha.md', NOTE('Alpha', 'first owner'));
      entered.resolve();
      await release.promise;
      await vault.commit!('first');
    },
    { staged: 'reject' },
  );
  await entered.promise;
  let calculated = false;
  const waiting = other.update((latest) => {
    calculated = true;
    const alpha = latest.find((file) => file.path === 'Alpha.md')!.text;
    return [{ path: 'Alpha.md', text: `${alpha}\nsecond owner` }];
  });
  await Promise.resolve();
  expect(calculated).toBe(false);
  release.resolve();
  await Promise.all([sequence, waiting]);
  expect(other.overlay?.files['Alpha.md']).toContain('first owner');
  expect(other.overlay?.files['Alpha.md']).toContain('second owner');
  await other.commit!('second');
  expect(files().find((file) => file.path === 'Alpha.md')?.text).toContain('second owner');
});

test('a failed sequence retains its edits, expires its handle, and releases ownership', async () => {
  const { w } = await setup();
  let expired!: OwnedVault;
  await expect(
    w.write(
      async (vault) => {
        expired = vault;
        await vault.stage('meta/first.md', '# First');
        throw new Error('model failed');
      },
      { staged: 'reject' },
    ),
  ).rejects.toThrow('model failed');
  await expect(expired.stage('meta/late.md', '# Too late')).rejects.toThrow('finished');
  expect(() => expired.files()).toThrow('finished');
  await w.stage('meta/second.md', '# Second');
  expect(Object.keys(w.overlay!.files)).toEqual(['meta/first.md', 'meta/second.md']);
});

test('a cancelled producer need not finish before a new owner enters; late tools cannot write', async () => {
  const { w } = await setup();
  const entered = deferred();
  const release = deferred();
  const abort = new AbortController();
  let late!: Promise<void>;
  const sequence = w.write(
    async (vault) => {
      entered.resolve();
      await release.promise;
      late = vault.stage('meta/late.md', '# Late');
      await late;
    },
    { staged: 'reject', signal: abort.signal },
  );
  const rejected = expect(sequence).rejects.toThrow(/abort/i);
  await entered.promise;
  abort.abort();
  await rejected;
  await w.stage('meta/next.md', '# Next');
  release.resolve();
  await Promise.resolve();
  await expect(late).rejects.toThrow(/abort/i);
  expect(Object.keys(w.overlay!.files)).toEqual(['meta/next.md']);
});

test('cancellation waits for in-flight persistence and refuses tools queued behind it', async () => {
  const { backend, w } = await setup();
  const entered = deferred();
  const release = deferred();
  const set = backend.keep.set;
  backend.keep.set = async (id, value) => {
    entered.resolve();
    await release.promise;
    await set(id, value);
  };
  const abort = new AbortController();
  let queued!: Promise<void>;
  const sequence = w.write(
    async (vault) => {
      const saving = vault.stage('meta/first.md', '# First');
      queued = vault.stage('meta/queued.md', '# Must not save');
      await Promise.all([saving, queued]);
    },
    { staged: 'reject', signal: abort.signal },
  );
  const rejected = expect(sequence).rejects.toThrow(/abort/i);
  await entered.promise;
  abort.abort();
  await rejected;
  let nextEntered = false;
  const next = w.update(() => {
    nextEntered = true;
    return [{ path: 'meta/next.md', text: '# Next' }];
  });
  await Promise.resolve();
  expect(nextEntered).toBe(false);
  release.resolve();
  await next;
  await expect(queued).rejects.toThrow(/abort/i);
  expect(Object.keys(w.overlay!.files)).toEqual(['meta/first.md', 'meta/next.md']);
});

test('cancelling while waiting does not run the callback or block later owners', async () => {
  const { w } = await setup();
  const entered = deferred();
  const release = deferred();
  const first = w.write(
    async () => {
      entered.resolve();
      await release.promise;
    },
    { staged: 'reject' },
  );
  await entered.promise;
  const abort = new AbortController();
  let called = false;
  const waiting = w.write(
    async () => {
      called = true;
    },
    { staged: 'reject', signal: abort.signal },
  );
  const rejected = expect(waiting).rejects.toThrow(/abort/i);
  abort.abort();
  await rejected;
  release.resolve();
  await first;
  await w.stage('meta/next.md', '# Next');
  expect(called).toBe(false);
});

test('existing staging must be included explicitly; a changed review is refused', async () => {
  const { w } = await setup();
  await w.stage('meta/pending.md', '# Pending');
  let called = false;
  await expect(
    w.write(
      async () => {
        called = true;
      },
      { staged: 'reject' },
    ),
  ).rejects.toThrow(StagedChanges);
  expect(called).toBe(false);
  const reviewed = [{ path: 'meta/pending.md', text: '# Pending' }];
  await w.stage('meta/pending.md', '# Changed after review');
  await expect(
    w.write(
      async () => {
        called = true;
      },
      { staged: reviewed },
    ),
  ).rejects.toThrow('changed after review');
  expect(called).toBe(false);
  await w.write(
    async (vault) => {
      await vault.commit!('included');
    },
    {
      staged: [{ path: 'meta/pending.md', text: '# Changed after review' }],
    },
  );
  expect(w.overlay).toBeNull();
});

test('sync advancing the head during ownership cannot overwrite a changed source', async () => {
  const { w, push, files } = await setup();
  await expect(
    w.write(
      async (vault) => {
        await vault.stage('Alpha.md', NOTE('Alpha', 'mine'));
        push({ 'Alpha.md': NOTE('Alpha', 'theirs') });
        await vault.commit!('mine');
      },
      { staged: 'reject' },
    ),
  ).rejects.toThrow(Conflict);
  expect(files().find((file) => file.path === 'Alpha.md')?.text).toContain('theirs');
  expect(w.overlay?.files['Alpha.md']).toContain('mine');
});

test('cancelling an asynchronous calculation releases ownership and drops its late result', async () => {
  const { w } = await setup();
  const entered = deferred();
  const release = deferred();
  const abort = new AbortController();
  const sequence = w.write(
    async (vault) =>
      vault.update(async () => {
        entered.resolve();
        await release.promise;
        return [{ path: 'meta/late.md', text: '# Late' }];
      }),
    { staged: 'reject', signal: abort.signal },
  );
  const rejected = expect(sequence).rejects.toThrow(/abort/i);
  await entered.promise;
  abort.abort();
  await rejected;
  await w.stage('meta/next.md', '# Next');
  release.resolve();
  await Promise.resolve();
  expect(Object.keys(w.overlay!.files)).toEqual(['meta/next.md']);
});

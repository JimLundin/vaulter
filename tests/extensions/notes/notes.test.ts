// Notes: each kept as it was said, listed in order, and told to whoever listens.
import { expect, it } from 'vitest';
import { startApp } from '../../app.ts';

/** Time for listeners, which hear of a change after it is kept. */
const settle = () => new Promise((ok) => setTimeout(ok, 20));

const use = async () => {
  await startApp(['notes']);
  return (await import('#extensions/notes')).notes;
};

it('keeps a note as it was, with when it was said', async () => {
  const n = await use();
  const a = await n.append({
    text: 'Coffee with Ada',
    source: 'voice',
    context: { place: 'café' },
  });
  expect([a.text, a.source, a.context]).toEqual([
    'Coffee with Ada',
    'voice',
    { place: 'café' },
  ]);
  expect(!Number.isNaN(Date.parse(a.at)), 'at is a date-time').toBeTruthy();
  expect(await n.get(a.id)).toEqual(a);
  expect(await n.get('nope')).toEqual(undefined);
});
it('refuses an empty note', async () => {
  const n = await use();
  await expect(n.append({ text: '   ' })).rejects.toThrow();
});
it('lists by when they were said, newest first, within a range', async () => {
  const n = await use();
  // One log for everyone: other checks' notes may be there too, so look at a range of its own.
  const range = {
    since: '2001-01-01T00:00:00.000Z',
    until: '2001-01-04T00:00:00.000Z',
  };
  await n.append({
    text: 'b',
    at: '2001-01-02T10:00:00.000Z',
    source: 'import',
  });
  await n.append({
    text: 'a',
    at: '2001-01-01T10:00:00.000Z',
    source: 'import',
  });
  await n.append({
    text: 'c',
    at: '2001-01-03T10:00:00.000Z',
    source: 'import',
  });
  expect((await n.list(range)).map((x) => x.text)).toEqual(['c', 'b', 'a']);
  expect(
    (await n.list({ ...range, order: 'oldest', limit: 2 })).map((x) => x.text),
  ).toEqual(['a', 'b']);
  expect(
    (
      await n.list({
        since: '2001-01-02T00:00:00.000Z',
        until: '2001-01-03T00:00:00.000Z',
      })
    ).map((x) => x.text),
  ).toEqual(['b']);
});
it('tells a subscriber about each note appended', async () => {
  const n = await use();
  const seen: string[] = [];
  const stop = await n.onAppended((x) => {
    seen.push(x.text);
  });
  await n.append({ text: 'one' });
  await settle();
  stop();
  await n.append({ text: 'two' });
  await settle();
  expect(seen).toEqual(['one']);
});

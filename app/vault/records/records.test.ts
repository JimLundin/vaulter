import { expect, test } from 'vitest';
import { parseVaultRecord, recordKinds } from './index.ts';
import { containment } from './wiki.ts';

test('each kind validates its own shape and rejects anything else', () => {
  expect(
    parseVaultRecord({ kind: 'page', title: 'Rut', aliases: ['Ruth'], created: '2026-10-07' }),
  ).toEqual({
    kind: 'page',
    title: 'Rut',
    aliases: ['Ruth'],
    created: '2026-10-07',
  });
  expect(() => parseVaultRecord({ kind: 'page', title: 'Rut', path: 'Rut.md' })).toThrow();
  expect(() => parseVaultRecord({ kind: 'page', title: 'Rut', created: 'YYYY-MM-DD' })).toThrow();
  expect(() => parseVaultRecord({ kind: 'unknown' })).toThrow('Unknown record kind');
  expect(() => parseVaultRecord({ kind: 'run', text: '' })).toThrow();
  expect(() =>
    parseVaultRecord({ kind: 'task', what: 'Renew the gym membership', status: 'paused' }),
  ).toThrow();
});

test('dates are as precise as the source: a day, a month or a year', () => {
  for (const date of ['2026-10-14', '2026-10', '2030'])
    expect(() => parseVaultRecord({ kind: 'date', date })).not.toThrow();
  expect(() => parseVaultRecord({ kind: 'decision', date: '14 October', what: 'x' })).toThrow();
});

test('settled lifecycle records keep their content', () => {
  expect(parseVaultRecord({ kind: 'question', text: 'Who?', abandoned: true })).toMatchObject({
    abandoned: true,
  });
  expect(() => parseVaultRecord({ kind: 'question', text: 'Who?', abandoned: false })).toThrow();
  expect(
    parseVaultRecord({ kind: 'task', what: 'Check the weight', status: 'completed' }),
  ).toMatchObject({
    status: 'completed',
  });
});

test('containers hold only what their kind allows', () => {
  expect(containment.section!('heading', 0)).toBe(true);
  expect(containment.section!('paragraph', 0)).toBe(false);
  expect(containment.section!('paragraph', 1)).toBe(true);
  expect(containment.paragraph!('link', 3)).toBe(true);
  expect(containment.paragraph!('list', 0)).toBe(false);
  expect(containment.item!('run', 0)).toBe(true);
  expect(containment.item!('list', 1)).toBe(true);
  expect(containment.list!('paragraph', 0)).toBe(false);
  expect(containment.page!('task', 0)).toBe(true);
  expect(containment.page!('run', 0)).toBe(false);
  for (const kind of Object.keys(containment)) expect(recordKinds.has(kind)).toBe(true);
});

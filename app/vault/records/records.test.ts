import { expect, test } from 'vitest';
import { parseVaultRecord } from './index.ts';

test('each kind validates its own shape and rejects anything else', () => {
  expect(() => parseVaultRecord({ kind: 'page', title: 'Rut' })).toThrow('Unknown record kind');
  expect(() => parseVaultRecord({ kind: 'question', text: 'Who?' })).toThrow('Unknown record kind');
  expect(() => parseVaultRecord({ kind: 'unknown' })).toThrow('Unknown record kind');
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
  expect(
    parseVaultRecord({ kind: 'task', what: 'Check the weight', status: 'completed' }),
  ).toMatchObject({
    status: 'completed',
  });
});

import { expect, test } from 'vitest';
import { parseQuestion } from './records.ts';

test('Questions reads the published question shape without inferred lifecycle fields', () => {
  const original = { kind: 'question', text: 'Where?' };
  expect(parseQuestion(original)).toEqual(original);
  expect(parseQuestion({ ...original, abandoned: true })).toMatchObject({ abandoned: true });
  expect(() => parseQuestion({ ...original, abandoned: false })).toThrow();
  expect(() => parseQuestion({ ...original, status: 'answered' })).toThrow();
  expect(() => parseQuestion({ kind: 'task', text: 'Where?' })).toThrow();
  expect(() => parseQuestion({ kind: 'question', text: '' })).toThrow();
});

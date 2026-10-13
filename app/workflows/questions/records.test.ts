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

test('suggestions retain proposal wording and reject blank, incomplete or duplicate choices', () => {
  const suggestion = {
    title: 'Garden wall',
    text: '  Use the garden wall.  ',
    reason: 'Morning light.',
  };
  const record = { kind: 'question', text: 'Where?', suggestions: [suggestion] };
  expect(parseQuestion(record)).toEqual(record);
  expect(() =>
    parseQuestion({ ...record, suggestions: [{ ...suggestion, reason: '  ' }] }),
  ).toThrow();
  expect(() => parseQuestion({ ...record, suggestions: [suggestion, suggestion] })).toThrow();
  expect(() => parseQuestion({ ...record, suggestions: [] })).toThrow();
  expect(() => parseQuestion({ ...record, suggestions: [{ title: 'Garden' }] })).toThrow();
});

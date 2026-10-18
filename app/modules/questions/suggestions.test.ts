import { expect, test } from 'vitest';
import { answerSuggestions } from './suggestions.ts';

test('suggestions require complete, distinct proposals', () => {
  const suggestion = { title: 'Garden', text: 'Garden wall.', reason: 'Leaves room.' };
  expect(answerSuggestions.parse([suggestion])).toEqual([suggestion]);
  expect(() => answerSuggestions.parse([{ ...suggestion, reason: '  ' }])).toThrow();
  expect(() => answerSuggestions.parse([suggestion, suggestion])).toThrow();
  expect(() => answerSuggestions.parse([])).toThrow();
  expect(() => answerSuggestions.parse([{ title: 'Garden' }])).toThrow();
});

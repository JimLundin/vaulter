// Route patterns: a page is found by its pattern, and a link made by it comes back to the same page.
import { expect, test } from 'vitest';

import { pattern } from './routing.ts';

const historyPage = pattern('/history/');
const filePage = pattern('/file/:file/');

test('a pattern with no params matches only its own path', () => {
  expect(historyPage.match('/history/')).toEqual({});
  expect(historyPage.match('/history/x/')).toBeNull();
  expect(historyPage.match('/histories/')).toBeNull();
  expect(historyPage.href()).toBe('/history/');
});

test('a link made by a pattern is matched by it again, with its params', () => {
  const file = 'people/Ada Lovelace.md';
  const href = filePage.href({ file });
  expect(href).toBe('/file/people%2FAda%20Lovelace.md/');
  expect(filePage.match(href)).toEqual({ file });
});

test('a param must be there', () => {
  expect(filePage.match('/file//')).toBeNull();
  expect(filePage.match('/file/')).toBeNull();
});

test('every param of a pattern is named', () => {
  const day = pattern('/days/:year/:month/');
  expect(day.match('/days/2026/10/')).toEqual({ year: '2026', month: '10' });
  expect(day.href({ year: '2026', month: '10' })).toBe('/days/2026/10/');
});

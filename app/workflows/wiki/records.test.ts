import { expect, test } from 'vitest';
import { parseWikiRecord, wikiSchemas, containment } from './records.ts';

test('Wiki validates its own page and inline definitions without claiming foreign records', () => {
  expect(
    parseWikiRecord({ kind: 'page', title: 'Rut', aliases: ['Ruth'], created: '2026-10-07' }),
  ).toEqual({
    kind: 'page',
    title: 'Rut',
    aliases: ['Ruth'],
    created: '2026-10-07',
  });
  expect(() => parseWikiRecord({ kind: 'page', title: 'Rut', path: 'Rut.md' })).toThrow();
  expect(() => parseWikiRecord({ kind: 'page', title: 'Rut', created: 'YYYY-MM-DD' })).toThrow();
  expect(() => parseWikiRecord({ kind: 'run', text: '' })).toThrow();
  expect(() =>
    parseWikiRecord({ kind: 'content', title: 'Report', text: 'Source prose.' }),
  ).toThrow('Unknown Wiki record kind');
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
  for (const kind of Object.keys(containment)) expect(Object.hasOwn(wikiSchemas, kind)).toBe(true);
});

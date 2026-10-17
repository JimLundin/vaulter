import { expect, test } from 'vitest';
import { wikiHome } from './home.ts';
import type { WikiPage } from './view.ts';

function page(id: string, links: string[] = []): WikiPage {
  return {
    id,
    title: id,
    summary: `${id} summary`,
    kind: 'page',
    updated: '',
    entry: { href: `/wiki/${id}/`, t: id, e: '', a: [], k: 'page', g: [] },
    metadata: [],
    sources: [],
    blocks: [
      {
        id: `${id}:text`,
        data: { kind: 'paragraph', text: `${id} passage` },
        children: [],
        evidence: [],
      },
      ...links.map((target, index) => ({
        id: `${id}:${index}`,
        data: { kind: 'link' },
        href: `#/wiki/${target}/`,
        children: [],
        evidence: [],
      })),
    ],
  };
}

test('home prioritizes pages linked by distinct other pages and attributes excerpts', () => {
  const pages = [
    page('Alpha'),
    page('Central'),
    page('Reader', ['Central', 'Central']),
    page('Other', ['Central']),
  ];
  const home = wikiHome(pages);
  expect(home.featured[0]?.page.id).toBe('Central');
  expect(home.featured[0]?.connections).toBe(2);
  expect(home.featured[0]).toMatchObject({ page: { id: 'Central' }, excerpt: 'Central passage' });
  expect(pages.map((item) => item.id)).toEqual(['Alpha', 'Central', 'Reader', 'Other']);
});

test('self links do not promote a page and unavailable content is not excerpted', () => {
  const hidden = page('Hidden', ['Hidden']);
  hidden.blocks[0] = {
    id: 'removed',
    data: { kind: 'unavailable', text: 'Removed words' },
    children: [],
    evidence: [],
  };
  const home = wikiHome([hidden]);
  expect(home.featured[0]?.connections).toBe(0);
  expect(home.featured[0]?.excerpt).toBeUndefined();
  expect(wikiHome([])).toEqual({ featured: [], subjects: [] });
});

test('subjects count distinct pages and exclude removed or unresolved classifications', () => {
  const studio = page('Studio');
  const reading = page('Reading');
  const term = {
    id: 'creative',
    relationship: 'membership',
    scheme: 'topic',
    key: 'creative',
    label: 'Creative work',
    state: 'resolved',
  } satisfies import('./view.ts').WikiClassification;
  studio.metadata = [
    term,
    { ...term, relationship: 'duplicate' },
    { ...term, id: 'deleted', state: 'deleted' },
    { ...term, id: 'missing', state: 'unresolved' },
  ];
  reading.metadata = [term, { ...term, id: 'type', scheme: 'type' }];
  expect(wikiHome([studio, reading]).subjects).toEqual([{ term, count: 2 }]);
});

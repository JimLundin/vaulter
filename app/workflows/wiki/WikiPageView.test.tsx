import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { WikiPageView } from './WikiPageView.tsx';
import type { WikiPage } from './pages.ts';
import { Text } from '@/ui/kit/index.ts';

const page: WikiPage = {
  id: 'studio',
  title: 'Garden studio',
  summary: 'Room for making things.',
  kind: 'page',
  updated: '2026-10-11',
  entry: { href: '/wiki/studio/', t: 'Garden studio', e: '', a: [], k: 'topic', g: [] },
  metadata: [
    {
      id: 'creative',
      relationship: 'tag',
      scheme: 'tag',
      key: 'creative',
      label: 'Creative work',
      state: 'resolved',
    },
  ],
  sources: [],
  blocks: [
    {
      id: 'claim',
      data: { kind: 'paragraph', text: 'Keep mornings free.' },
      children: [],
      evidence: [],
    },
    {
      id: 'connection',
      data: { kind: 'relationship', predicate: 'related', label: 'Morning routine' },
      href: '#/wiki/morning/',
      children: [],
      evidence: [],
    },
    {
      id: 'question',
      data: { kind: 'question', text: 'Which tools should stay?' },
      children: [],
      evidence: [],
    },
  ],
};

test('a typed Wiki page composes its classification, connections and records without a storage adapter', () => {
  const html = renderToStaticMarkup(
    <WikiPageView page={page} onBack={() => undefined} onFilter={() => undefined} />,
  );
  expect(html).toContain('Garden studio');
  expect(html).toContain('Subject tags');
  expect(html).toContain('Creative work');
  expect(html).toContain('Keep mornings free.');
  expect(html).toContain('Connections');
  expect(html).toContain('href="#/wiki/morning/"');
  expect(html).toContain('Questions &amp; next steps');
  expect(html).toContain('Which tools should stay?');
});

test('a Wiki page delegates included questions to the supplied record owner', () => {
  const html = renderToStaticMarkup(
    <WikiPageView
      page={page}
      onBack={() => undefined}
      onFilter={() => undefined}
      renderRecord={(block) =>
        block.id === 'question' ? <Text>Answered in Planning</Text> : undefined
      }
    />,
  );
  expect(html).toContain('Answered in Planning');
  expect(html).not.toContain('Which tools should stay?');
});

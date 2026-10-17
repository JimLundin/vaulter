import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import type { WikiBlock, WikiReference } from '@/workflows/wiki/pages.ts';
import { WikiBlocks } from './blocks.tsx';
import { Text } from '@/ui/kit/index.ts';

const reference = (id: string, start: number, end: number): WikiReference => ({
  id,
  title: 'Planning message',
  text: 'Retained source',
  context: 'Retained source',
  claim: { start, end },
  source: { node: 'message', transaction: 'original' },
  sequence: 1,
  state: 'original',
});
const run = (id: string, text: string, marks?: string[]): WikiBlock => ({
  id,
  data: { kind: 'run', text, ...(marks ? { marks } : {}) },
  children: [],
  evidence: [],
});
const render = (blocks: WikiBlock[]) =>
  renderToStaticMarkup(<WikiBlocks blocks={blocks} onEvidence={() => undefined} />);

test('one selected statement spans formatting while surrounding prose stays uncited', () => {
  const html = render([
    {
      id: 'paragraph',
      data: { kind: 'paragraph' },
      evidence: [reference('cite', 7, 21)],
      children: [
        run('before', 'Before '),
        run('claim-start', 'Keep ', ['strong']),
        run('claim-end', 'mornings free. After.'),
      ],
    },
  ]);
  expect(html.match(/<button/g)).toHaveLength(1);
  expect(html).toContain('aria-label="Evidence for Keep mornings "');
  expect(html).toContain('<strong>Keep </strong>');
  expect(html).toMatch(/<\/button>.*free\. After\./);
});

test('distinct and overlapping selections expose only the applicable sources', () => {
  const html = render([
    {
      id: 'paragraph',
      data: { kind: 'paragraph' },
      children: [run('words', 'One. Two. Three.')],
      evidence: [reference('one', 0, 4), reference('two', 5, 9), reference('also-two', 5, 9)],
    },
  ]);
  expect(html.match(/<button/g)).toHaveLength(2);
  expect(html).toContain('aria-label="Evidence for One."');
  expect(html).toContain('aria-label="Evidence for Two."');
  expect(html).not.toContain('Evidence for Three.');
});

test('a navigation link inside a selected statement retains its route without nested controls', () => {
  const html = render([
    {
      id: 'paragraph',
      data: { kind: 'paragraph' },
      evidence: [reference('cite', 0, 20)],
      children: [
        run('start', 'See '),
        {
          ...run('link', 'the studio'),
          data: { kind: 'link', text: 'the studio' },
          href: '#/wiki/studio/',
        },
        run('end', ' today.'),
      ],
    },
  ]);
  expect(html).toContain('href="#/wiki/studio/"');
  for (const button of html.match(/<button[^>]*>.*?<\/button>/gs) ?? [])
    expect(button).not.toContain('<a');
});

test('nested foreign records use their supplied module UI without Wiki interpreting lifecycle', () => {
  const blocks: WikiBlock[] = [
    {
      id: 'section',
      data: { kind: 'section' },
      evidence: [],
      children: [
        {
          id: 'question',
          data: { kind: 'question', text: 'Where?', abandoned: true },
          evidence: [],
          children: [],
        },
      ],
    },
  ];
  const html = renderToStaticMarkup(
    <WikiBlocks
      blocks={blocks}
      onEvidence={() => undefined}
      renderRecord={(block) =>
        block.id === 'question' ? <Text>Questions-owned answered record</Text> : undefined
      }
    />,
  );
  expect(html).toContain('Questions-owned answered record');
  expect(html).not.toContain('Where?');
  expect(html).not.toContain('abandoned');
  const fallback = render(blocks);
  expect(fallback).toContain('Where?');
  expect(fallback).not.toContain('abandoned');
});

// The renderer refuses code on its own, for a note that never went through the check.
// biome-ignore-all lint/security/noSecrets: the strings are hostile markup to render, not secrets
import { beforeAll, expect, test } from 'vitest';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { renderBody, loadMdx } from './markdown.ts';
import { reader } from './index.tsx';

beforeAll(() => loadMdx());

const html = (body: string, ext: 'md' | 'mdx' = 'mdx') =>
  // biome-ignore lint/complexity/noUselessFragments: render() needs a node; renderBody may return a string
  render(<>{renderBody({ id: 'X', path: `X.${ext}`, ext, body }, reader.mdx)}</>);

test.each([
  ['{globalThis.pwned = 1}'],
  ['<NoteList type={(globalThis.pwned = 1)} />'],
  ['export const a = (globalThis.pwned = 1)'],
  ['<Chart x={[globalThis]} />'],
])('%s renders an error and runs nothing', (body) => {
  expect(html(body)).toContain('doesn&#x27;t render'); // React escapes the apostrophe
  expect((globalThis as any).pwned).toBeUndefined();
});

test('raw HTML in Markdown is dropped', () => {
  const out = html(
    'Hi <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n<iframe src="https://x"></iframe>',
    'md',
  );
  expect(out).not.toMatch(/<script|<img|<iframe|onerror/);
  expect(out).toContain('Hi');
});

test('javascript: links are not rendered as links', () => {
  expect(html('[x](javascript:alert(1))', 'md')).not.toContain('javascript:');
});

test('comments are dropped', () => {
  expect(html('A {/* hidden */} B\n\n{/* block */}')).toBe('<p>A  B</p>');
});

test('a component renders', () => {
  expect(html('<Timeline items={[{date: "2026-01-01", text: "A"}]} />')).toContain(
    '<time>2026-01-01</time>',
  );
});

test.each([
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  ' javascript:x',
  'data:text/html,x',
  'vbscript:x',
])('%s is dropped from links, images and Timeline', (url) => {
  const out = html(
    `[a](<${url}>) ![b](<${url}>)\n\n<Timeline items={[{date: "2026", text: "t", href: ${JSON.stringify(url)}}]} />`,
  );
  // What a browser would follow: resolve each href and src and look at the scheme.
  for (const [, u] of out.matchAll(/(?:href|src)="([^"]*)"/g))
    expect(new URL(u.replace(/&amp;/g, '&'), 'https://vault.example/').protocol).toBe('https:');
});

test('ordinary links stay', () => {
  const out = html('[a](https://x.se) [b](</Ada.md#h>) [c](mailto:a@b.se) [d](#top)', 'md');
  expect(out).toContain('href="https://x.se"');
  expect(out).toContain('href="#/ada/#h"');
  expect(out).toContain('href="mailto:a@b.se"');
  expect(out).toContain('href="#/x/#top"');
});

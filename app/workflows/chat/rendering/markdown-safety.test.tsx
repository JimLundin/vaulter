// The renderer refuses code on its own, for a note that never went through the check.
// biome-ignore-all lint/security/noSecrets: the strings are hostile markup to render, not secrets
import { expect, test } from 'vitest';
import { renderToStaticMarkup as render } from 'react-dom/server';
import { renderBody } from './markdown.ts';

const html = (body: string) =>
  // biome-ignore lint/complexity/noUselessFragments: render() needs a node; renderBody may return a string
  render(<>{renderBody({ id: 'X', path: 'X.md', body })}</>);

test('raw HTML in Markdown is dropped', () => {
  const out = html(
    'Hi <script>alert(1)</script> <img src=x onerror=alert(1)>\n\n<iframe src="https://x"></iframe>',
  );
  expect(out).not.toMatch(/<script|<img|<iframe|onerror/);
  expect(out).toContain('Hi');
});

test('javascript: links are not rendered as links', () => {
  expect(html('[x](javascript:alert(1))')).not.toContain('javascript:');
});

test.each([
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  'java\tscript:alert(1)',
  ' javascript:x',
  'data:text/html,x',
  'vbscript:x',
])('%s is dropped from links and images', (url) => {
  const out = html(`[a](<${url}>) ![b](<${url}>)`);
  // What a browser would follow: resolve each href and src and look at the scheme.
  for (const [, u] of out.matchAll(/(?:href|src)="([^"]*)"/g))
    expect(new URL(u.replace(/&amp;/g, '&'), 'https://vault.example/').protocol).toBe('https:');
});

test('ordinary links stay', () => {
  const out = html('[a](https://x.se) [b](</Ada.md#h>) [c](mailto:a@b.se) [d](#top)');
  expect(out).toContain('href="https://x.se"');
  expect(out).toContain('href="#/ada/#h"');
  expect(out).toContain('href="mailto:a@b.se"');
  expect(out).toContain('href="#/x/#top"');
});

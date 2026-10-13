import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RecordedToolExecution, toolSummary } from '../../agent/tool-presentation.tsx';
import { contentToolPresentation } from './tool-presentation.tsx';
import { contentEnabledTools } from './tool-actions.ts';

test('Content owns unversioned publication and exact-version read receipt meaning', () => {
  const evidence = {
    name: 'createNode',
    status: 'complete' as const,
    input: { title: 'Recorded title', text: 'Recorded text' },
    output: { node: 'content-1', transaction: 'accepted-1', accepted: true },
  };
  expect(toolSummary(evidence, 2, [contentToolPresentation])).toBe('created 2 nodes');
  const markup = renderToStaticMarkup(
    <RecordedToolExecution evidence={evidence} adapters={[contentToolPresentation]} />,
  );
  expect(markup).toContain('Create content node');
  expect(markup).toContain('Recorded title');
  expect(markup).toContain('Recorded text');
  expect(markup).toContain('Recorded transaction: accepted-1');
  const read = {
    name: 'readNode',
    status: 'complete' as const,
    input: { node: 'content-1' },
    output: {
      node: 'content-1',
      transaction: 'original-1',
      data: { kind: 'content', title: 'Original title', text: 'Original text' },
    },
  };
  expect(toolSummary(read, 1, [contentToolPresentation])).toBe('read 1 node');
  expect(
    renderToStaticMarkup(
      <RecordedToolExecution evidence={read} adapters={[contentToolPresentation]} />,
    ),
  ).toContain('Original text');
  expect(contentEnabledTools.map(({ name }) => name)).toEqual([
    'createNode',
    'readNode',
    'updateNode',
  ]);
});

test('future Content versions and unrecognized receipts retain fallback without asserting publication', () => {
  const evidence = {
    name: 'createNode',
    status: 'complete' as const,
    input: {},
    output: { error: 'Historical rejection' },
  };
  expect(toolSummary(evidence, 1, [contentToolPresentation])).toBe('used createNode');
  expect(contentToolPresentation({ ...evidence, version: 'future' })).toBeUndefined();
  expect(toolSummary({ ...evidence, status: 'running' }, 1, [contentToolPresentation])).toContain(
    'outcome uncertain',
  );
});

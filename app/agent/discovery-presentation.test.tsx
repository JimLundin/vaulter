import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RecordedToolExecution, toolSummary } from './tool-presentation.tsx';
import { discoveryPresentation } from './discovery-presentation.tsx';

test('Agent preserves historical discovery labels and context receipts without executable tools', () => {
  const evidence = {
    name: 'listQuestionContext',
    input: { query: 'garden' },
    output: { sources: [{ text: 'Morning light' }], knowledge: [] },
    status: 'complete' as const,
  };
  const adapters = [discoveryPresentation];
  const markup = renderToStaticMarkup(
    <RecordedToolExecution evidence={evidence} adapters={adapters} />,
  );
  expect(markup).toContain('Context query: garden');
  expect(markup).toContain('Retained context: 1 sources');
  expect(toolSummary(evidence, 1, adapters)).toBe('read Question context');
  expect(toolSummary({ ...evidence, status: 'failed' }, 1, adapters)).not.toBe(
    'read Question context',
  );
  expect(discoveryPresentation({ ...evidence, version: 'future' })).toBeUndefined();
  expect(discoveryPresentation({ ...evidence, name: 'askQuestion' })).toBeUndefined();
});

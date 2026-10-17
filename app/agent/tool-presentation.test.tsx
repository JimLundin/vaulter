import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { Text } from '@/ui/kit/index.ts';
import {
  RecordedToolExecution,
  type ToolEvidenceState,
  type ToolPresentationAdapter,
  toolStatus,
  toolSummary,
} from './tool-presentation.tsx';

const evidence: ToolEvidenceState = {
  name: 'retiredAction',
  version: 'unknown-version',
  input: { supplied: 'Exact historical input' },
  output: { retained: 'Exact recorded outcome' },
  status: 'complete',
};

test('unknown historical Tool execution renders named raw evidence without an executable capability', () => {
  const markup = renderToStaticMarkup(<RecordedToolExecution evidence={evidence} />);
  expect(markup).toContain('retiredAction (unknown-version)');
  expect(markup).toContain('Exact historical input');
  expect(markup).toContain('Exact recorded outcome');
  expect(markup).toContain('Accepted');
});

test('Agent qualifies running, cancelled, failed and save-pending evidence independently of owner labels', () => {
  const owner: ToolPresentationAdapter = vi.fn(() => ({
    title: 'Owner task',
    live: 'Doing owner task',
    done: () => 'completed owner task',
    receipt: <Text>Owner receipt</Text>,
  }));
  const states = [
    { status: 'running' as const, expected: 'Outcome uncertain' },
    { status: 'cancelled' as const, expected: 'Cancelled' },
    { status: 'failed' as const, error: 'Recorded failure', expected: 'Recorded failure' },
    { status: 'complete' as const, savePending: true, expected: 'Completed; save pending' },
    { status: 'failed' as const, savePending: true, expected: 'Outcome needs saving' },
  ];
  for (const { expected, ...state } of states) {
    const recorded = { ...evidence, ...state };
    expect(toolStatus(recorded)).toBe(expected);
    const markup = renderToStaticMarkup(
      <RecordedToolExecution evidence={recorded} adapters={[owner]} />,
    );
    expect(markup).toContain(expected);
    expect(toolSummary(recorded, 1, [owner])).not.toContain('completed owner task');
  }
  expect(toolStatus({ ...evidence, status: 'running' }, true)).toBeUndefined();
});

test.each(['failed', 'cancelled'] as const)(
  'an unsaved %s outcome keeps its recorded error alongside the publication state',
  (status) => {
    const markup = renderToStaticMarkup(
      <RecordedToolExecution
        evidence={{
          name: 'retiredAction',
          input: {},
          status,
          savePending: true,
          error: 'Recorded rejection detail',
        }}
      />,
    );
    expect(markup).toContain('Outcome needs saving');
    expect(markup).toContain('Recorded rejection detail');
    expect(markup).not.toContain('Accepted');
  },
);

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { RecordedToolExecution, toolSummary } from '@/agent/tool-presentation.tsx';
import { questionToolPresentation } from './tool-presentation.tsx';
import { questionCapabilities } from './data/tools.ts';

test('Questions renders retained request evidence and owner labels without reading or answering it', () => {
  const evidence = {
    name: 'askQuestion',
    status: 'complete' as const,
    input: { text: 'Which tools should stay?' },
    output: { question: 'question-1', transaction: 'accepted-1', accepted: true },
  };
  const markup = renderToStaticMarkup(
    <RecordedToolExecution evidence={evidence} adapters={[questionToolPresentation]} />,
  );
  expect(markup).toContain('Ask a Question');
  expect(markup).toContain('Which tools should stay?');
  expect(markup).toContain('Recorded Question: question-1');
  expect(markup).toContain('Recorded transaction: accepted-1');
  expect(markup).not.toContain('Answer question');
  expect(toolSummary(evidence, 1, [questionToolPresentation])).toBe('retained 1 Question');
  expect(questionCapabilities.map(({ name }) => name)).toEqual([
    'askQuestion',
    'readQuestion',
    'listQuestions',
  ]);
});

test('Question read receipts keep recorded status while unknown versions fall back to raw evidence', () => {
  const evidence = {
    name: 'readQuestion',
    status: 'complete' as const,
    input: { key: 'question-1' },
    output: {
      question: 'question-1',
      transaction: 'original-1',
      text: 'Original wording',
      status: 'open',
    },
  };
  const markup = renderToStaticMarkup(
    <RecordedToolExecution evidence={evidence} adapters={[questionToolPresentation]} />,
  );
  expect(markup).toContain('Question status when read: open');
  expect(markup).toContain('Original wording');
  expect(questionToolPresentation({ ...evidence, version: 'future' })).toBeUndefined();
  expect(toolSummary({ ...evidence, version: 'future' }, 1, [questionToolPresentation])).toBe(
    'used readQuestion (future)',
  );
});

import { evidence } from './fixtures.test-support.ts';
// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import {
  EmbeddedQuestion,
  questionDescriptions,
  renderQuestionRecord,
} from './EmbeddedQuestion.tsx';
import type { Question } from './reading.ts';

const question: Question = {
  id: 'question',
  evidence: evidence('question', 'asked'),
  data: { kind: 'question', text: 'Which wall?' },
  status: 'open',
  subjects: [],
  answers: [],
};
const record = { id: 'question', data: question.data };

test('the Question owner selects its embedded record and owns loading, missing and stale-read presentation', () => {
  expect(
    renderQuestionRecord(
      { id: 'paragraph', data: { kind: 'paragraph' } },
      { questions: null, loading: false },
      {},
    ),
  ).toBeUndefined();
  const opening = renderToStaticMarkup(
    <EmbeddedQuestion record={record} state={{ questions: null, loading: true }} />,
  );
  expect(opening).toContain('Which wall?');
  expect(opening).toContain('Loading question details');
  const missing = renderToStaticMarkup(
    <EmbeddedQuestion record={record} state={{ questions: [], loading: false }} />,
  );
  expect(missing).toContain('missing or has been removed');
  const failed = renderToStaticMarkup(
    <EmbeddedQuestion
      record={record}
      state={{ questions: null, loading: false, error: 'Offline read' }}
    />,
  );
  expect(failed).toContain('Question details unavailable: Offline read');
});

test('embedded read errors preserve the Question and disable its Answer action until refresh succeeds', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  const onAnswer = vi.fn(async () => undefined);
  try {
    await act(() =>
      root.render(
        <EmbeddedQuestion
          record={record}
          state={{ questions: [question], loading: false, error: 'Offline read' }}
          onAnswer={onAnswer}
        />,
      ),
    );
    expect(document.body.textContent).toContain('last recorded status');
    expect(document.querySelector('textarea')?.disabled).toBe(true);
    await act(() =>
      root.render(
        <EmbeddedQuestion
          record={record}
          state={{ questions: [question], loading: false }}
          onAnswer={onAnswer}
        />,
      ),
    );
    expect(document.querySelector('textarea')?.disabled).toBe(false);
    expect(onAnswer).not.toHaveBeenCalled();
  } finally {
    await act(() => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

test('Question target descriptions expose retained text and source navigation', () => {
  const descriptions = questionDescriptions();
  expect(
    descriptions.describeTarget({
      evidence: evidence('source'),
      text: 'Garden.',
      label: 'Planning',
      href: '#/wiki/planning/',
      state: 'available',
    }),
  ).toEqual({
    title: 'Planning',
    text: 'Garden.',
    href: '#/wiki/planning/',
    navigationLabel: 'Open source context: Planning',
  });
});

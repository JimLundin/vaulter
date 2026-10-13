// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request } from '../../vault/nodes/fixtures.test-support.ts';
import {
  EmbeddedQuestion,
  questionDescriptions,
  renderQuestionRecord,
} from './EmbeddedQuestion.tsx';
import type { Question } from './reading.ts';

const question: Question = {
  id: 'question',
  key: { node: 'question', transaction: 'asked' },
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

test('Question target and author descriptions resolve its addresses while foreign owners interpret payloads', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('asked', [
      create('user', { kind: 'actor', name: 'Owner' }),
      create('evidence', { kind: 'content', text: 'Garden.' }),
    ]),
  );
  const view = await nodes.snapshot();
  const descriptions = questionDescriptions(
    view,
    {
      text: vi.fn(() => 'Foreign exact prose'),
      describe: vi.fn(() => ({ title: 'Planning', href: '#/foreign/planning/' })),
    },
    vi.fn(() => 'Foreign identity name'),
  );
  expect(
    descriptions.describeTarget({ version: view.get('evidence'), state: 'available' }),
  ).toEqual({
    title: 'Planning',
    href: '#/foreign/planning/',
    text: 'Foreign exact prose',
    navigationLabel: 'Open source context: Planning',
  });
  expect(
    descriptions.describeAuthor({
      ...question,
      created: { transaction: 'asked', at: '', author: { node: 'user' }, origin: null },
    }),
  ).toBe('Foreign identity name');
  const wiki = questionDescriptions(
    view,
    {
      text: () => undefined,
      describe: () => ({
        title: 'Studio',
        href: '#/wiki/studio/',
        navigationLabel: 'Open Wiki page: Studio',
      }),
    },
    () => undefined,
  );
  expect(
    wiki.describeTarget({ version: view.get('evidence'), state: 'available' })?.navigationLabel,
  ).toBe('Open Wiki page: Studio');
  const unnamed = questionDescriptions(
    view,
    { text: () => 'Retained prose', describe: () => undefined },
    () => undefined,
  );
  expect(unnamed.describeTarget({ version: view.get('evidence'), state: 'available' })).toEqual({
    title: 'Retained source',
    text: 'Retained prose',
  });
  nodes.close();
});

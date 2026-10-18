import { evidence } from '@/questions/fixtures.test-support.ts';
// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { QuestionsPage, type QuestionsPageProps } from './QuestionsPage.tsx';
import type { Question } from '@/questions/reading.ts';
import { questionsRoute } from '@/questions/routes.ts';

const open: Question = {
  id: 'open',
  evidence: evidence('open', 'asked'),
  data: { kind: 'question', text: 'Where should the workbench go?' },
  status: 'open',
  subjects: [{ evidence: evidence('studio'), state: 'available' }],
  answers: [],
};
const answered: Question = {
  ...open,
  id: 'answered',
  evidence: evidence('answered', 'asked'),
  data: { kind: 'question', text: 'Which wall should be painted?' },
  status: 'answered',
  answers: [
    {
      evidence: evidence('answer', 'answered'),
      state: 'available',
      text: 'The garden wall.',
    },
  ],
};
const abandoned: Question = {
  ...open,
  id: 'abandoned',
  data: { kind: 'question', text: 'Should the old desk be retained?' },
  status: 'abandoned',
};
const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount(props: QuestionsPageProps) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  roots.push(root);
  act(() => root.render(<QuestionsPage {...props} />));
  return root;
}
function button(label: string) {
  const entry = [...document.querySelectorAll('button')].find((item) => item.textContent === label);
  if (!entry) throw new Error(`Missing ${label} button`);
  return entry;
}
function search(text: string) {
  const input = document.querySelector('input');
  if (!input) throw new Error('Missing question search');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing native input setter');
  setter.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const collection: QuestionsPageProps = {
  state: { questions: [open, answered, abandoned], loading: false },
  describeTarget: (target) =>
    target.evidence.entity === 'studio'
      ? { title: 'Garden studio', href: '#/wiki/studio/' }
      : undefined,
};

test('the collection defaults to open questions, filters every lifecycle and searches subjects and retained answer text', async () => {
  mount(collection);
  expect(document.body.textContent).toContain(open.data.text);
  expect(document.body.textContent).not.toContain(answered.data.text);
  expect(document.body.textContent).not.toContain(abandoned.data.text);
  expect(document.querySelector('a[href="#/wiki/studio/"]')?.textContent).toBe('Garden studio');
  await act(async () => button('All').click());
  expect(document.body.textContent).toContain(answered.data.text);
  expect(document.body.textContent).toContain(abandoned.data.text);
  await act(async () => search('garden studio'));
  expect(document.body.textContent).toContain(open.data.text);
  await act(async () => search('garden wall'));
  expect(document.body.textContent).not.toContain(open.data.text);
  expect(document.body.textContent).toContain(answered.data.text);
  await act(async () => search(''));
  await act(async () => button('Answered').click());
  expect(document.body.textContent).toContain(answered.data.text);
  expect(document.body.textContent).not.toContain(open.data.text);
  await act(async () => button('Abandoned').click());
  expect(document.body.textContent).toContain(abandoned.data.text);
  expect(document.body.textContent).not.toContain(answered.data.text);
});

test('answers stay in the collection with no separate question-detail navigation', async () => {
  mount({ ...collection, onAnswer: async () => undefined });
  expect(document.querySelector('textarea')?.getAttribute('aria-label')).toBe('Your answer');
  expect(document.querySelector('a[href^="#/questions/"]')).toBeNull();
  await act(async () => button('Answered').click());
  expect(document.body.textContent).toContain(answered.data.text);
  expect(document.body.textContent).toContain('The garden wall.');
  expect(document.body.textContent).not.toContain(open.data.text);
  expect(document.querySelector('input[aria-label="Find questions"]')).not.toBeNull();
});

test('Questions links always target the collection and retained detail links still match it', () => {
  expect(questionsRoute.href()).toBe('/questions/');
  expect(questionsRoute.match('/questions/')).toEqual({});
  expect(questionsRoute.match('/questions/question%20%2F%20identity/')).toEqual({});
  expect(questionsRoute.match('/questions/removed/')).toEqual({});
  expect(questionsRoute.match('/wiki/')).toBeNull();
});

test('loading and errors preserve retained questions and disable stale answer actions', async () => {
  const onAnswer = vi.fn(async () => undefined);
  const root = mount({ state: { questions: null, loading: true }, onAnswer });
  expect(document.body.textContent).toContain('Opening questions…');
  await act(async () =>
    root.render(
      <QuestionsPage
        {...collection}
        state={{ questions: [open], loading: true }}
        onAnswer={onAnswer}
      />,
    ),
  );
  expect(document.body.textContent).toContain(open.data.text);
  expect(document.body.textContent).toContain('Refreshing questions…');
  expect(document.querySelector('textarea')?.disabled).toBe(true);
  await act(async () =>
    root.render(
      <QuestionsPage
        {...collection}
        state={{ questions: [open], loading: false, error: 'Reading unavailable' }}
        onAnswer={onAnswer}
      />,
    ),
  );
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Reading unavailable');
  expect(document.body.textContent).toContain('Showing previously loaded questions.');
  expect(document.querySelector('textarea')?.disabled).toBe(true);
  await act(async () => root.render(<QuestionsPage {...collection} onAnswer={onAnswer} />));
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector('textarea')?.disabled).toBe(false);
});

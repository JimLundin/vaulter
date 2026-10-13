// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { QuestionsPage, type QuestionsPageProps } from './QuestionsPage.tsx';
import type { Question } from './reading.ts';
import { questionRoute, questionsRoute } from './routes.ts';

const open: Question = {
  id: 'open',
  key: { node: 'open', transaction: 'asked' },
  data: { kind: 'question', text: 'Where should the workbench go?' },
  status: 'open',
  subjects: [{ address: { node: 'studio' }, state: 'available' }],
  answers: [],
};
const answered: Question = {
  ...open,
  id: 'answered',
  key: { node: 'answered', transaction: 'asked' },
  data: { kind: 'question', text: 'Which wall should be painted?' },
  status: 'answered',
  answers: [
    {
      address: { node: 'answer', transaction: 'answered' },
      state: 'available',
      version: {
        key: { node: 'answer', transaction: 'answered' },
        data: { kind: 'answer', text: 'The garden wall.' },
        placement: null,
        connection: null,
      },
    },
  ],
};
const abandoned: Question = {
  ...open,
  id: 'abandoned',
  data: { kind: 'question', text: 'Should the old desk be retained?', abandoned: true },
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
    target.address?.node === 'studio'
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

test('an individual question stays visible after answering and missing deep links are explicit', async () => {
  const root = mount({ ...collection, node: answered.id });
  expect(document.body.textContent).toContain(answered.data.text);
  expect(document.body.textContent).toContain('The garden wall.');
  expect(document.body.textContent).not.toContain(open.data.text);
  expect(document.querySelector('a[href="#/questions/"]')?.textContent).toBe('All questions');
  await act(async () => root.render(<QuestionsPage {...collection} node="removed" />));
  expect(document.body.textContent).toContain('This question is missing or has been removed.');
  expect(questionsRoute.href()).toBe('/questions/');
  expect(questionRoute.match(questionRoute.href({ node: 'question / identity' }))).toEqual({
    node: 'question / identity',
  });
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
  expect(button('Answer').disabled).toBe(true);
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
  expect(button('Answer').disabled).toBe(true);
  await act(async () => root.render(<QuestionsPage {...collection} onAnswer={onAnswer} />));
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(button('Answer').disabled).toBe(false);
});

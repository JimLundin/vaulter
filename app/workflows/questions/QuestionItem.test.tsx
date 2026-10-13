// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { QuestionItem } from './QuestionItem.tsx';
import type { Question } from './reading.ts';

const question: Question = {
  id: 'question',
  key: { node: 'question', transaction: 'raised' },
  data: { kind: 'question', text: 'Where should the workbench go?' },
  status: 'open',
  subjects: [],
  answers: [],
};

const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function mount(
  onAnswer: (question: Question, text: string) => Promise<void>,
  disabledReason?: string,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  roots.push(root);
  act(() =>
    root.render(
      <QuestionItem question={question} onAnswer={onAnswer} disabledReason={disabledReason} />,
    ),
  );
  return root;
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  );
  if (!match) throw new Error(`Missing ${label} button`);
  return match;
}

function writeAnswer(text: string) {
  const textarea = document.querySelector('textarea');
  if (!textarea) throw new Error('Missing answer field');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing native textarea setter');
  setter.call(textarea, text);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

test('the same projected question shows its lifecycle without copying or interpreting foreign records', () => {
  const open = renderToStaticMarkup(<QuestionItem question={question} />);
  expect(open).toContain('Open question');
  expect(open).toContain('Where should the workbench go?');
  const answered = renderToStaticMarkup(
    <QuestionItem
      question={{
        ...question,
        status: 'answered',
        answers: [
          {
            address: { node: 'answer', transaction: 'answered' },
            relationship: 'answered-by',
            state: 'deleted',
          },
        ],
      }}
      describeTarget={() => ({ title: 'Planning response', href: '#/chat/planning/' })}
    />,
  );
  expect(answered).toContain('Answered');
  expect(answered).toContain('Planning response');
  expect(answered).toContain('href="#/chat/planning/"');
  expect(answered).toContain('Answer removed; recorded link retained');
  expect(answered).not.toContain('Open question');
  expect(
    renderToStaticMarkup(<QuestionItem question={{ ...question, status: 'abandoned' }} />),
  ).toContain('Abandoned');
});

test('unavailable answer navigation never emits unsafe URLs', () => {
  const html = renderToStaticMarkup(
    <QuestionItem
      question={{
        ...question,
        status: 'answered',
        answers: [{ address: { node: 'answer' }, state: 'missing' }],
      }}
      describeTarget={() => ({ title: 'Answer response', href: 'javascript:alert(1)' })}
    />,
  );
  expect(html).toContain('Answer response');
  expect(html).toContain('Answer unavailable; recorded link retained');
  expect(html).not.toContain('javascript:');
});

test('own retained answers render their text and subject links use only safe supplied navigation', () => {
  const html = renderToStaticMarkup(
    <QuestionItem
      question={{
        ...question,
        status: 'answered',
        subjects: [{ address: { node: 'studio' }, state: 'available' }],
        answers: [
          {
            address: { node: 'answer', transaction: 'answered' },
            state: 'available',
            version: {
              key: { node: 'answer', transaction: 'answered' },
              data: { kind: 'answer', text: 'Beside the garden wall.' },
              placement: null,
              connection: null,
            },
          },
        ],
      }}
      describeTarget={(target) =>
        target.address?.node === 'studio'
          ? { title: 'Garden studio', href: 'javascript:alert(1)' }
          : undefined
      }
    />,
  );
  expect(html).toContain('Beside the garden wall.');
  expect(html).toContain('Garden studio');
  expect(html).not.toContain('javascript:');
});

test('answer failures preserve the draft, pending saves reject duplicate submits and accepted saves reset it', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const onAnswer = vi
    .fn<(question: Question, text: string) => Promise<void>>()
    .mockRejectedValueOnce(new Error('Save unavailable'))
    .mockImplementationOnce(() => waiting);
  mount(onAnswer);
  await act(async () => button('Answer').click());
  expect(document.querySelector('label')?.textContent).toBe('Answer');
  expect(button('Save answer').disabled).toBe(true);
  await act(async () => writeAnswer('  Beside the garden wall.  '));
  await act(async () => button('Save answer').click());
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('Save unavailable');
  expect(document.querySelector('textarea')?.value).toBe('  Beside the garden wall.  ');
  expect(onAnswer).toHaveBeenLastCalledWith(question, 'Beside the garden wall.');
  await act(() => {
    const form = document.querySelector('form');
    if (!form) throw new Error('Missing answer form');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(onAnswer).toHaveBeenCalledTimes(2);
  expect(button('Saving answer…').disabled).toBe(true);
  expect(button('Cancel').disabled).toBe(true);
  expect(document.querySelector('textarea')?.disabled).toBe(true);
  await act(async () => release());
  expect(document.querySelector('textarea')).toBeNull();
  await act(async () => button('Answer').click());
  expect(document.querySelector('textarea')?.value).toBe('');
});

test('read-only questions explain why answering is disabled and cancel discards an unsaved draft', async () => {
  const onAnswer = vi.fn(async () => undefined);
  const root = mount(onAnswer, 'Reconnect to answer questions.');
  expect(button('Answer').disabled).toBe(true);
  const reason = button('Answer').getAttribute('aria-describedby');
  expect(reason && document.getElementById(reason)?.textContent).toBe(
    'Reconnect to answer questions.',
  );
  await act(async () => root.render(<QuestionItem question={question} onAnswer={onAnswer} />));
  await act(async () => button('Answer').click());
  await act(async () => writeAnswer('Temporary response'));
  await act(async () => button('Cancel').click());
  await act(async () => button('Answer').click());
  expect(document.querySelector('textarea')?.value).toBe('');
  expect(onAnswer).not.toHaveBeenCalled();
});

test('an answer draft keeps the question version read when its editor opened', async () => {
  const onAnswer = vi
    .fn<(question: Question, text: string) => Promise<void>>()
    .mockRejectedValue(new Error('Question changed. Review it before answering.'));
  const root = mount(onAnswer);
  await act(async () => button('Answer').click());
  expect(document.activeElement).toBe(document.querySelector('textarea'));
  await act(async () => writeAnswer('Beside the garden wall.'));
  const changed: Question = {
    ...question,
    key: { ...question.key, transaction: 'reworded' },
    data: { kind: 'question', text: 'Where should the larger workbench go?' },
  };
  await act(async () => root.render(<QuestionItem question={changed} onAnswer={onAnswer} />));
  await act(async () => button('Save answer').click());
  expect(onAnswer).toHaveBeenCalledWith(question, 'Beside the garden wall.');
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Question changed. Review it before answering.',
  );
  expect(document.querySelector('textarea')?.value).toBe('Beside the garden wall.');
});

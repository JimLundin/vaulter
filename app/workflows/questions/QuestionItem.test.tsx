// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { QuestionItem } from './QuestionItem.tsx';
import type { Question } from './reading.ts';
import {
  createTranscription,
  type Transcription,
  type TranscriptionEvents,
} from '@/transcription.ts';

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
  record = question,
  transcription?: Transcription,
) {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  roots.push(root);
  act(() =>
    root.render(
      <QuestionItem
        question={record}
        onAnswer={onAnswer}
        disabledReason={disabledReason}
        transcription={transcription}
      />,
    ),
  );
  return root;
}

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (entry) => entry.getAttribute('aria-label') === label || entry.textContent === label,
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

test('dictation corrects the answer draft and waits for explicit submission', async () => {
  let events!: TranscriptionEvents;
  let finish!: (text: string) => void;
  const final = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const voice = createTranscription(async (next) => {
    events = next;
    return { close() {}, finish: () => final };
  });
  const onAnswer = vi.fn(async () => undefined);
  mount(onAnswer, undefined, question, voice);
  await act(async () => writeAnswer('Keep the bench clear.'));
  await act(async () => button('Start voice interaction').click());
  await act(async () => events.text('Leave space'));
  expect(document.querySelector('textarea')?.value).toBe('Keep the bench clear. Leave space');
  expect(document.querySelector('textarea')?.readOnly).toBe(true);
  await act(async () => button('Finish recording').click());
  await act(async () => {
    document
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(onAnswer).not.toHaveBeenCalled();
  await act(async () => finish('Leave room for the hand plane.'));
  expect(document.querySelector('textarea')?.value).toBe(
    'Keep the bench clear. Leave room for the hand plane.',
  );
  expect(document.querySelector('textarea')?.readOnly).toBe(false);
  expect(onAnswer).not.toHaveBeenCalled();
  await act(async () => document.querySelector('textarea')?.focus());
  await act(async () => button('Save answer').click());
  expect(onAnswer).toHaveBeenCalledExactlyOnceWith(
    question,
    'Keep the bench clear. Leave room for the hand plane.',
  );
  voice.dispose();
});

test('changing the question during finalization keeps available words and rejects the late transcript', async () => {
  let events!: TranscriptionEvents;
  let signal!: AbortSignal;
  let finish!: (text: string) => void;
  const final = new Promise<string>((resolve) => {
    finish = resolve;
  });
  const voice = createTranscription(async (next, abort) => {
    events = next;
    signal = abort;
    return { close() {}, finish: () => final };
  });
  const onAnswer = vi.fn(async () => undefined);
  const root = mount(onAnswer, undefined, question, voice);
  await act(async () => button('Start voice interaction').click());
  await act(async () => events.text('Keep the available words.'));
  await act(async () => button('Finish recording').click());
  const changed = { ...question, key: { ...question.key, transaction: 'reworded' } };
  await act(async () =>
    root.render(<QuestionItem question={changed} onAnswer={onAnswer} transcription={voice} />),
  );
  expect(signal.aborted).toBe(true);
  await act(async () => finish('Late corrected words for the old question.'));
  expect(document.querySelector('textarea')?.value).toBe('Keep the available words.');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Question has changed');
  expect(onAnswer).not.toHaveBeenCalled();
  voice.dispose();
});

test('an unrelated Question card cannot adopt or cancel another task’s recording', async () => {
  let events!: TranscriptionEvents;
  const voice = createTranscription(async (next) => {
    events = next;
    return { close() {}, finish: async () => 'Another task’s words.' };
  });
  await voice.start();
  const onAnswer = vi.fn(async () => undefined);
  const root = mount(onAnswer, undefined, question, voice);
  expect(button('Start voice interaction').disabled).toBe(true);
  await act(async () => events.text('Another task’s words.'));
  expect(document.querySelector('textarea')?.value).toBe('');
  await act(async () => root.render(null));
  expect(voice.snapshot().phase).toBe('listening');
  voice.dispose();
});

test('leaving an answer releases its microphone and a later card receives none of its text', async () => {
  let events!: TranscriptionEvents;
  let signal!: AbortSignal;
  const voice = createTranscription(async (next, abort) => {
    events = next;
    signal = abort;
    return { close() {}, finish: async () => 'Late words.' };
  });
  const onAnswer = vi.fn(async () => undefined);
  const root = mount(onAnswer, undefined, question, voice);
  await act(async () => button('Start voice interaction').click());
  await act(async () => events.text('Available words.'));
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    root.render(<QuestionItem question={question} onAnswer={onAnswer} transcription={voice} />),
  );
  await act(async () => events.text('Late words.'));
  expect(document.querySelector('textarea')?.value).toBe('');
  expect(button('Start voice interaction').disabled).toBe(false);
  voice.dispose();
});

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
  expect(document.querySelector('textarea')?.getAttribute('aria-label')).toBe('Your answer');
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
  expect(document.querySelector('textarea')?.disabled).toBe(true);
  await act(async () => release());
  expect(document.querySelector('textarea')?.value).toBe('');
});

test('read-only questions explain why answering is disabled and preserve an unsaved draft while reconnecting', async () => {
  const onAnswer = vi.fn(async () => undefined);
  const root = mount(onAnswer, 'Reconnect to answer questions.');
  expect(button('Save answer').disabled).toBe(true);
  const reason = button('Save answer').getAttribute('aria-describedby');
  expect(reason && document.getElementById(reason)?.textContent).toContain(
    'Reconnect to answer questions.',
  );
  await act(async () => root.render(<QuestionItem question={question} onAnswer={onAnswer} />));
  await act(async () => writeAnswer('Temporary response'));
  await act(async () =>
    root.render(
      <QuestionItem
        question={question}
        onAnswer={onAnswer}
        disabledReason="Reconnect to answer questions."
      />,
    ),
  );
  expect(document.querySelector('textarea')?.value).toBe('Temporary response');
  expect(button('Save answer').disabled).toBe(true);
  await act(async () => root.render(<QuestionItem question={question} onAnswer={onAnswer} />));
  expect(document.querySelector('textarea')?.value).toBe('Temporary response');
  expect(onAnswer).not.toHaveBeenCalled();
});

test('an answer draft blocks stale wording until the person reviews the current question', async () => {
  const onAnswer = vi
    .fn<(question: Question, text: string) => Promise<void>>()
    .mockRejectedValue(new Error('Question changed. Review it before answering.'));
  const root = mount(onAnswer);
  await act(async () => document.querySelector('textarea')?.focus());
  expect(document.activeElement).toBe(document.querySelector('textarea'));
  await act(async () => writeAnswer('Beside the garden wall.'));
  const changed: Question = {
    ...question,
    key: { ...question.key, transaction: 'reworded' },
    data: { kind: 'question', text: 'Where should the larger workbench go?' },
  };
  await act(async () => root.render(<QuestionItem question={changed} onAnswer={onAnswer} />));
  await act(async () => button('Save answer').click());
  expect(onAnswer).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    'Question has changed; review its current wording before answering.',
  );
  expect(document.querySelector('textarea')?.value).toBe('Beside the garden wall.');
  await act(async () => button('Use current question').click());
  await act(async () => button('Save answer').click());
  expect(onAnswer).toHaveBeenCalledWith(changed, 'Beside the garden wall.');
});

test('suggestions start editable drafts, keep each choice’s text and require an explicit save', async () => {
  const onAnswer = vi.fn(async () => undefined);
  let events!: TranscriptionEvents;
  const voice = createTranscription(async (next) => {
    events = next;
    return { close() {}, finish: async () => 'with room for shelves.' };
  });
  const record: Question = {
    ...question,
    data: {
      ...question.data,
      suggestions: [
        {
          title: 'Garden wall',
          text: 'Use the garden wall.',
          reason: 'The source records its morning light.',
        },
        {
          title: 'North wall',
          text: 'Use the north wall.',
          reason: 'The source records its sockets and shelves.',
        },
      ],
    },
  };
  mount(onAnswer, undefined, record, voice);
  const choice = (title: string) =>
    [...document.querySelectorAll('button')].find((item) => item.textContent?.startsWith(title))!;
  expect(document.querySelector('textarea')?.value).toBe('');
  expect([...document.querySelectorAll('button[aria-pressed=true]')]).toHaveLength(0);
  expect(document.body.textContent).not.toContain('Write my own');
  await act(async () => writeAnswer('Keep the bench mobile.'));
  expect(document.querySelector('textarea')?.value).toBe('Keep the bench mobile.');
  expect(onAnswer).not.toHaveBeenCalled();
  await act(async () => choice('Garden wall').click());
  expect(document.activeElement).toBe(document.querySelector('textarea'));
  expect(document.querySelector('textarea')?.value).toBe('Use the garden wall.');
  await act(async () => writeAnswer('Garden wall,'));
  await act(async () => document.querySelector('textarea')?.blur());
  await act(async () => button('Start voice interaction').click());
  await act(async () => events.text('with room'));
  expect(choice('North wall').disabled).toBe(true);
  await act(async () => button('Finish recording').click());
  await act(async () => choice('North wall').click());
  expect(document.querySelector('textarea')?.value).toBe('Use the north wall.');
  await act(async () => writeAnswer('North wall, beside the shelves.'));
  await act(async () => choice('Garden wall').click());
  expect(document.querySelector('textarea')?.value).toBe('Garden wall, with room for shelves.');
  await act(async () => choice('North wall').click());
  expect(document.querySelector('textarea')?.value).toBe('North wall, beside the shelves.');
  await act(async () => writeAnswer('Keep the bench mobile.'));
  expect(onAnswer).not.toHaveBeenCalled();
  await act(async () => button('Save answer').click());
  expect(onAnswer).toHaveBeenCalledExactlyOnceWith(record, 'Keep the bench mobile.');
  voice.dispose();
});

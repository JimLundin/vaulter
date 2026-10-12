import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
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

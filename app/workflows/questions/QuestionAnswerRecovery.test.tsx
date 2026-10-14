// @vitest-environment happy-dom
import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, revise } from '../../vault/nodes/fixtures.test-support.ts';
import type { NodeCommit } from '../../vault/nodes/store.ts';
import { createQuestionAnswers } from './answers.ts';
import { EmbeddedQuestion } from './EmbeddedQuestion.tsx';
import { QuestionsPage } from './QuestionsPage.tsx';
import { readQuestions, type Question } from './reading.ts';

function button(label: string): HTMLButtonElement {
  const match = [...document.querySelectorAll('button')].find(
    (entry) => entry.textContent === label,
  );
  if (!match) throw new Error(`Missing ${label} button`);
  return match;
}

function write(text: string) {
  const textarea = document.querySelector('textarea');
  if (!textarea) throw new Error('Missing answer field');
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) throw new Error('Missing native textarea setter');
  setter.call(textarea, text);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

async function fixture() {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('asked', [
      create('user', { kind: 'actor', name: 'Owner' }),
      create('question', { kind: 'question', text: 'Which wall?' }),
    ]),
  );
  const [question] = await readQuestions(nodes);
  return { nodes, question };
}

test.each([false, true])(
  'owner recovery survives collection and embedded remounts and retries the identical request (accepted: %s)',
  async (accepted) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const { nodes, question } = await fixture();
    const requests: NodeCommit[] = [];
    let release!: () => void;
    const publication = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = {};
    const answers = createQuestionAnswers({
      session,
      nodes: transactionFixture({
        ...nodes,
        commit: async (value) => {
          requests.push(value);
          await publication;
          if (accepted) await nodes.commit(value);
          throw new Error('Save response lost');
        },
      }),
      recordedBy: 'user',
    });
    const root = createRoot(document.body);
    const render = (record: Question, embedded: boolean) => {
      const state = { questions: [record], loading: false };
      return embedded ? (
        <EmbeddedQuestion
          record={{ id: record.id, data: record.data }}
          state={state}
          answers={answers}
        />
      ) : (
        <QuestionsPage state={state} answers={answers} />
      );
    };
    try {
      await act(() => root.render(render(question, accepted)));
      await act(() => write('  Garden wall.  '));
      await act(() => button('Save answer').click());
      await vi.waitFor(() => expect(requests).toHaveLength(1));
      expect(answers.snapshot().attempts[0].phase).toBe('pending');
      await act(() => root.render(null));
      await act(() => root.render(render(question, !accepted)));
      expect(document.body.textContent).toContain('Saving the original answer');
      expect(button('Retry original answer').disabled).toBe(true);
      expect(document.querySelector('textarea')).toBeNull();
      await act(async () => {
        release();
        await vi.waitFor(() => expect(answers.snapshot().attempts[0].phase).toBe('uncertain'));
      });
      expect(answers.snapshot().attempts[0]).toMatchObject({
        text: 'Garden wall.',
        phase: 'uncertain',
        error: 'Save response lost',
      });
      await expect(answers.answer(question, 'Street wall.')).rejects.toThrow('original answer');
      await act(() => root.render(null));
      const [current] = await readQuestions(nodes);
      await act(() => root.render(render(current, !accepted)));
      expect(document.body.textContent).toContain('Garden wall.');
      expect(document.querySelector('textarea')).toBeNull();
      expect(button('Retry original answer').disabled).toBe(false);
      answers.configure({
        session,
        nodes: transactionFixture({
          ...nodes,
          commit: (value) => {
            requests.push(value);
            return nodes.commit(value);
          },
        }),
        recordedBy: 'changed-author',
      });
      await act(async () => {
        button('Retry original answer').click();
        await vi.waitFor(() => expect(answers.snapshot().attempts).toEqual([]));
      });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toBe(requests[0]);
      expect(requests[1].id).toBe(requests[0].id);
      expect(requests[1].recordedBy).toBe('user');
      expect(answers.snapshot().attempts).toEqual([]);
      expect((await readQuestions(nodes))[0].answers).toHaveLength(1);
    } finally {
      await act(() => root.unmount());
      answers.dispose();
      nodes.close();
      document.body.replaceChildren();
      vi.unstubAllGlobals();
    }
  },
);

test('reworded Questions keep recovery visible and a definitive retry conflict restores editing with its error', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const { nodes, question } = await fixture();
  const session = {};
  const answers = createQuestionAnswers({
    session,
    nodes: transactionFixture({
      ...nodes,
      commit: () => Promise.reject(new Error('Connection lost')),
    }),
    recordedBy: 'user',
  });
  await expect(answers.answer(question, 'Garden wall.')).rejects.toThrow('Connection lost');
  await nodes.commit(
    request('reworded', [
      await revise(nodes, 'question', { kind: 'question', text: 'Which room?' }),
    ]),
  );
  const [current] = await readQuestions(nodes);
  answers.configure({ session, nodes: transactionFixture(nodes), recordedBy: 'user' });
  const root = createRoot(document.body);
  try {
    await act(() =>
      root.render(
        <QuestionsPage state={{ questions: [current], loading: false }} answers={answers} />,
      ),
    );
    expect(document.body.textContent).toContain('Which room?');
    expect(document.body.textContent).toContain('For: Which wall?');
    expect(document.querySelector('textarea')).toBeNull();
    await act(async () => {
      button('Retry original answer').click();
      await vi.waitFor(() => expect(answers.snapshot().attempts).toEqual([]));
    });
    expect(answers.snapshot().attempts).toEqual([]);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Conflict');
    expect(document.querySelector('textarea')?.disabled).toBe(false);
    await act(() => write('Garden room.'));
    await act(async () => {
      button('Save answer').click();
      await vi.waitFor(() => expect(answers.snapshot().attempts).toEqual([]));
    });
    expect((await readQuestions(nodes))[0].answers[0].version?.data?.text).toBe('Garden room.');
  } finally {
    await act(() => root.unmount());
    answers.dispose();
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

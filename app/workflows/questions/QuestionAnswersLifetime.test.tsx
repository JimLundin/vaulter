// @vitest-environment happy-dom
import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and the build verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import type { QuestionAnswers, QuestionAnswersOptions } from './answers.ts';
import { useQuestionAnswers } from './use-questions.ts';

test('Answer hook keeps one owner across navigation and capabilities, replaces sessions and cleans up effect replay', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  const nodes = memoryNodeBackend();
  const replacementNodes = memoryNodeBackend();
  let answers!: QuestionAnswers;
  function Surface({ options }: { options: QuestionAnswersOptions }) {
    answers = useQuestionAnswers(options);
    return null;
  }
  const session = {};
  try {
    await act(() =>
      root.render(
        <StrictMode>
          <Surface options={{ session, nodes: transactionFixture(nodes), recordedBy: 'user' }} />
        </StrictMode>,
      ),
    );
    const original = answers;
    const handler = answers.answer;
    expect(original.closed()).toBe(false);
    await act(() =>
      root.render(
        <StrictMode>
          <Surface
            options={{
              session,
              nodes: transactionFixture(replacementNodes),
              recordedBy: 'user',
              availability: 'Reconnect before answering.',
            }}
          />
        </StrictMode>,
      ),
    );
    expect(answers).toBe(original);
    expect(answers.answer).toBe(handler);
    await act(() =>
      root.render(
        <StrictMode>
          <Surface
            options={{
              session: {},
              nodes: transactionFixture(replacementNodes),
              recordedBy: 'user',
            }}
          />
        </StrictMode>,
      ),
    );
    expect(answers).not.toBe(original);
    expect(original.closed()).toBe(true);
    expect(answers.closed()).toBe(false);
    await act(() => root.unmount());
    expect(answers.closed()).toBe(true);
  } finally {
    nodes.close();
    replacementNodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

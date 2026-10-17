// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and the build verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import type { QuestionAnswers, QuestionAnswersOptions } from './answers.ts';
import { useQuestionAnswers } from './use-questions.ts';

test('Answer hook keeps one owner across navigation and capabilities, replaces sessions and cleans up effect replay', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  const actions = { answer: async () => undefined };
  const replacement = { answer: async () => undefined };
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
          <Surface options={{ session, actions }} />
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
              actions: replacement,
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
              actions: replacement,
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
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

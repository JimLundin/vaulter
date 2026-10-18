import type { ReactNode } from 'react';
import { Stack, Text } from '@/ui/kit/index.ts';
import {
  QuestionItem,
  type QuestionItemProps,
  type QuestionTargetDescription,
} from './QuestionItem.tsx';
import type { QuestionTarget, QuestionsReadingState } from '@/questions/reading.ts';
import { questionAnswerAvailability } from '@/questions/availability.ts';
import { useQuestionAnswerState } from '@/questions/use-questions.ts';

export function questionDescriptions() {
  return {
    describeTarget: (target: QuestionTarget): QuestionTargetDescription => ({
      title: target.label || 'Retained source',
      text: target.text,
      href: target.href,
      navigationLabel: target.href
        ? `Open source context: ${target.label || 'Retained source'}`
        : undefined,
    }),
  };
}

export interface EmbeddedQuestionProps extends Omit<QuestionItemProps, 'question'> {
  readonly record: {
    readonly id: string;
    readonly data: { readonly kind?: string; readonly text?: string };
  };
  readonly state: QuestionsReadingState;
}

/** The owner decides which records it renders; enclosing modules only compose this adapter. */
export function renderQuestionRecord(
  record: EmbeddedQuestionProps['record'],
  state: QuestionsReadingState,
  props: Omit<EmbeddedQuestionProps, 'record' | 'state'>,
): ReactNode | undefined {
  if (record.data.kind !== 'question') return;
  return <EmbeddedQuestion key={record.id} record={record} state={state} {...props} />;
}

/** Store-free Question rendering for any enclosing module, without importing its record projection. */
export function EmbeddedQuestion({
  record,
  state,
  disabledReason,
  answers,
  ...props
}: EmbeddedQuestionProps) {
  const answerState = useQuestionAnswerState(answers);
  if (record.data.kind !== 'question') return null;
  const question =
    state.questions?.find((entry) => entry.id === record.id) ??
    answerState.attempts.find((attempt) => attempt.question.id === record.id)?.question;
  if (!question)
    return (
      <Stack gap="xs">
        <Text>{String(record.data.text ?? '')}</Text>
        <Text tone="muted" size="sm">
          {state.error
            ? `Question details unavailable: ${state.error}`
            : state.loading
              ? 'Loading question details…'
              : 'This question is missing or has been removed.'}
        </Text>
      </Stack>
    );
  return (
    <Stack gap="xs">
      {!!state.error && (
        <Text role="status" tone="muted" size="sm">
          Question details could not refresh; showing the last recorded status. {state.error}
        </Text>
      )}
      <QuestionItem
        {...props}
        answers={answers}
        question={question}
        disabledReason={questionAnswerAvailability(state, disabledReason)}
      />
    </Stack>
  );
}

import type { ReactNode } from 'react';
import type { NodeVersion, JsonObject } from '@/vault/nodes/model.ts';
import type { NodeSnapshot } from '@/vault/nodes/store.ts';
import type { SourceDescription } from '@/vault/sources.ts';
import { Stack, Text } from '@/ui/kit/index.ts';
import {
  QuestionItem,
  type QuestionItemProps,
  type QuestionTargetDescription,
} from './QuestionItem.tsx';
import type { QuestionTarget, QuestionsReadingState } from './reading.ts';
import { questionAnswerAvailability } from './availability.ts';
import { useQuestionAnswerState } from './use-questions.ts';

/** Questions interprets its records; supplied readers retain foreign text, navigation and identity meaning. */
export function questionDescriptions(
  view: NodeSnapshot | undefined,
  reading: {
    readonly text: (node: NodeVersion, view: NodeSnapshot) => string | undefined;
    readonly describe: (
      node: NodeVersion,
      view: NodeSnapshot,
    ) => (SourceDescription & { readonly navigationLabel?: string }) | undefined;
  },
) {
  return {
    describeTarget: (target: QuestionTarget): QuestionTargetDescription | undefined => {
      if (!(view && target.version)) return;
      const text = reading.text(target.version, view);
      const description = reading.describe(target.version, view);
      if (description)
        return {
          ...description,
          text,
          navigationLabel:
            description.navigationLabel ??
            (description.href
              ? `Open source context${description.title ? `: ${description.title}` : ''}`
              : undefined),
        };
      if (text) return { title: 'Retained source', text };
    },
  };
}

export interface EmbeddedQuestionProps extends Omit<QuestionItemProps, 'question'> {
  readonly record: { readonly id: string; readonly data: JsonObject };
  readonly state: QuestionsReadingState;
}

/** The owner decides which records it renders; enclosing modules only compose this adapter. */
export function renderQuestionRecord(
  record: EmbeddedQuestionProps['record'],
  state: QuestionsReadingState,
  props: Omit<EmbeddedQuestionProps, 'record' | 'state'>,
): ReactNode | undefined {
  if (record.data.kind !== 'question') return;
  return <EmbeddedQuestion record={record} state={state} {...props} />;
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

import type { QuestionAnswerHandler } from './answers.ts';
import { useState } from 'react';
import type { Transcription } from '@/transcription.ts';
import { FeaturePage, PageControls, Loader, Stack, Text } from '@/ui/kit/index.ts';
import { QuestionItem, type QuestionTargetDescription } from './QuestionItem.tsx';
import type { Question, QuestionTarget, QuestionsReadingState } from './reading.ts';
import { parseAnswer } from './records.ts';
import type { QuestionAnswers } from './answers.ts';
import { questionAnswerAvailability } from './availability.ts';
import { useQuestionAnswerState } from './use-questions.ts';

type QuestionFilter = 'open' | 'all' | 'answered' | 'abandoned';
const filters: readonly { value: QuestionFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'answered', label: 'Answered' },
  { value: 'abandoned', label: 'Abandoned' },
];

export interface QuestionsPageProps {
  readonly state: QuestionsReadingState;
  readonly describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
  readonly onAnswer?: QuestionAnswerHandler;
  readonly answers?: QuestionAnswers;
  readonly disabledReason?: string;
  readonly transcription?: Transcription;
}

/** One retained collection drives both this page and question records embedded in other views. */
export function QuestionsPage({
  state,
  describeTarget,
  onAnswer,
  answers,
  disabledReason,
  transcription,
}: QuestionsPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QuestionFilter>('open');
  const { questions, loading, error } = state;
  const answerState = useQuestionAnswerState(answers);
  const retained = new Set(answerState.attempts.map((attempt) => attempt.question.id));
  const collection =
    questions || answerState.attempts.length
      ? [
          ...(questions ?? []),
          ...answerState.attempts
            .filter(
              (attempt) => !questions?.some((question) => question.id === attempt.question.id),
            )
            .map((attempt) => attempt.question),
        ]
      : null;
  const matching = collection?.filter((question) => {
    if (retained.has(question.id)) return true;
    return (
      (filter === 'all' || question.status === filter) &&
      searchText(question, describeTarget).toLocaleLowerCase().includes(query.toLocaleLowerCase())
    );
  });
  const answerDisabledReason = questionAnswerAvailability(state, disabledReason);
  return (
    <FeaturePage title="Questions">
      <Stack gap="xl" inset="page" block="lg">
        <PageControls
          search={{
            type: 'search',
            label: 'Find questions',
            placeholder: 'Find a question, subject or source…',
            value: query,
            onValueChange: setQuery,
          }}
          filters={{
            type: 'single',
            label: 'Question status',
            value: filter,
            options: filters,
            active: filter !== 'all',
            onValueChange: (value) => {
              const chosen = filters.find((entry) => entry.value === value);
              if (chosen) setFilter(chosen.value);
            },
          }}
        />
        {!!error && (
          <Text role="alert" tone="danger">
            {error}
          </Text>
        )}
        {!!loading && <Loader>{questions ? 'Refreshing questions…' : 'Opening questions…'}</Loader>}
        {!!questions && !!error && <Text tone="muted">Showing previously loaded questions.</Text>}
        {!(questions || loading || error) && <Text>Questions are unavailable.</Text>}
        {matching?.map((question) => (
          <QuestionItem
            key={question.id}
            question={question}
            describeTarget={describeTarget}
            onAnswer={onAnswer}
            answers={answers}
            disabledReason={answerDisabledReason}
            transcription={transcription}
          />
        ))}
        {questions && !matching?.length && (
          <Text>
            {query
              ? 'No questions found.'
              : filter === 'open'
                ? 'No open questions.'
                : 'No questions found.'}
          </Text>
        )}
      </Stack>
    </FeaturePage>
  );
}

function searchText(
  question: Question,
  describeTarget: QuestionsPageProps['describeTarget'],
): string {
  return [
    question.data.text,
    ...question.subjects.map((subject) => describeTarget?.(subject)?.title || subject.label || ''),
    ...question.answers.map((answer) =>
      answer.version?.data?.kind === 'answer'
        ? parseAnswer(answer.version.data).text
        : describeTarget?.(answer)?.title || answer.label || '',
    ),
    ...(question.sources ?? []).map(
      (source) => describeTarget?.(source)?.title || source.label || '',
    ),
    ...(question.data.suggestions ?? []).flatMap((suggestion) => [
      suggestion.title,
      suggestion.text,
    ]),
  ].join(' ');
}

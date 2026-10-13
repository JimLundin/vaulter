import { useState } from 'react';
import {
  FeaturePage,
  Input,
  Link,
  Loader,
  Stack,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from '../../ui/kit/index.ts';
import {
  QuestionItem,
  type QuestionAnswerHandler,
  type QuestionTargetDescription,
} from './QuestionItem.tsx';
import type { Question, QuestionTarget, QuestionsReadingState } from './reading.ts';
import { parseAnswer } from './records.ts';
import { questionRoute, questionsRoute } from './routes.ts';

type QuestionFilter = 'open' | 'all' | 'answered' | 'abandoned';
const filters: readonly { value: QuestionFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'all', label: 'All' },
  { value: 'answered', label: 'Answered' },
  { value: 'abandoned', label: 'Abandoned' },
];

export interface QuestionsPageProps {
  readonly state: QuestionsReadingState;
  readonly node?: string;
  readonly describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
  readonly onAnswer?: QuestionAnswerHandler;
  readonly disabledReason?: string;
}

/** One retained collection drives both this page and question records embedded in other views. */
export function QuestionsPage({
  state,
  node,
  describeTarget,
  onAnswer,
  disabledReason,
}: QuestionsPageProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<QuestionFilter>('open');
  const { questions, loading, error } = state;
  const selected = node ? questions?.find((question) => question.id === node) : undefined;
  const matching = questions?.filter((question) => {
    if (node) return question.id === node;
    return (
      (filter === 'all' || question.status === filter) &&
      searchText(question, describeTarget).toLocaleLowerCase().includes(query.toLocaleLowerCase())
    );
  });
  const answerDisabledReason =
    disabledReason ||
    (error
      ? 'Questions could not be refreshed. Reload before answering.'
      : loading
        ? 'Refreshing questions…'
        : undefined);
  return (
    <FeaturePage
      title="Questions"
      description="Requests for information about subjects in your vault."
    >
      <Stack>
        {node ? (
          <Link href={`#${questionsRoute.href()}`}>All questions</Link>
        ) : (
          <>
            <Input
              type="search"
              aria-label="Find questions"
              placeholder="Find a question or subject…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ToggleGroup
              type="single"
              aria-label="Question status"
              value={filter}
              onValueChange={(value: string) => {
                const chosen = filters.find((entry) => entry.value === value);
                if (chosen) setFilter(chosen.value);
              }}
            >
              {filters.map((entry) => (
                <ToggleGroupItem key={entry.value} value={entry.value}>
                  {entry.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </>
        )}
        {!!error && (
          <Text role="alert" tone="danger">
            {error}
          </Text>
        )}
        {!!loading && <Loader>{questions ? 'Refreshing questions…' : 'Opening questions…'}</Loader>}
        {!!questions && !!error && <Text tone="muted">Showing previously loaded questions.</Text>}
        {!(questions || loading || error) && <Text>Questions are unavailable.</Text>}
        {node && questions && !selected && (
          <Text>This question is missing or has been removed.</Text>
        )}
        {matching?.map((question) => (
          <Stack key={question.id} gap="xs">
            <QuestionItem
              question={question}
              describeTarget={describeTarget}
              onAnswer={onAnswer}
              disabledReason={answerDisabledReason}
            />
            {!node && (
              <Text size="sm">
                <Link
                  href={`#${questionRoute.href({ node: question.id })}`}
                  aria-label={`Question details: ${question.data.text}`}
                >
                  Question details
                </Link>
              </Text>
            )}
          </Stack>
        ))}
        {questions && !node && !matching?.length && (
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
  ].join(' ');
}

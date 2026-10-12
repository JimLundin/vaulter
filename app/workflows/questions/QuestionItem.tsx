import { Badge, Link, Row, Stack, Text } from '../../ui/kit/index.ts';
import { isSafeUrl } from '../../vault/documents/notes/safe-url.ts';
import type { Question, QuestionTarget } from './reading.ts';

export interface QuestionTargetDescription {
  readonly title: string;
  /** Navigation opens the source context; it does not imply an exact historical answer view. */
  readonly href?: string;
  readonly navigationLabel?: string;
}

/** The owning module interprets status; Product supplies navigation for foreign subject and answer records. */
export function QuestionItem({
  question,
  describeTarget,
}: {
  question: Question;
  describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
}) {
  const label =
    question.status === 'open'
      ? 'Open question'
      : question.status === 'answered'
        ? 'Answered'
        : 'Abandoned';
  return (
    <Stack gap="xs" as="section" aria-label={label}>
      <Row wrap={true}>
        <Badge>{label}</Badge>
        <Text as="span">{question.data.text}</Text>
      </Row>
      {question.answers.map((answer, index) => {
        const description = describeTarget?.(answer);
        const title = description?.title || answer.label || 'Answer';
        const availability =
          answer.state === 'unresolved'
            ? 'Answer not linked'
            : answer.state === 'deleted'
              ? 'Answer removed; recorded link retained'
              : answer.state === 'missing'
                ? 'Answer unavailable; recorded link retained'
                : answer.state === 'newer'
                  ? 'Recorded answer; newer content available'
                  : 'Recorded answer';
        const href = description?.href;
        return (
          <Text key={answer.relationship ?? index} size="sm" tone="muted">
            {href && isSafeUrl(href) ? (
              <Link href={href}>{description?.navigationLabel ?? title}</Link>
            ) : (
              <Text as="span">{title}</Text>
            )}{' '}
            · {availability}
          </Text>
        );
      })}
    </Stack>
  );
}

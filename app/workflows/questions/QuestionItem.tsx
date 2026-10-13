import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Form,
  Link,
  Row,
  SettingField,
  Stack,
  Text,
  Textarea,
} from '../../ui/kit/index.ts';
import { isSafeUrl } from '../../vault/documents/notes/safe-url.ts';
import type { Question, QuestionTarget } from './reading.ts';
import { parseAnswer } from './records.ts';

export interface QuestionTargetDescription {
  readonly title: string;
  /** Navigation opens the source context; it does not imply an exact historical answer view. */
  readonly href?: string;
  readonly navigationLabel?: string;
}

export type QuestionAnswerHandler = (question: Question, text: string) => Promise<void>;

export interface QuestionItemProps {
  readonly question: Question;
  readonly describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
  readonly onAnswer?: QuestionAnswerHandler;
  readonly disabledReason?: string;
}

/** The owning module interprets status; Product supplies navigation for foreign subject and answer records. */
export function QuestionItem({
  question,
  describeTarget,
  onAnswer,
  disabledReason,
}: QuestionItemProps) {
  const [editing, setEditing] = useState<Question>();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submitting = useRef(false);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();
  useLayoutEffect(() => {
    if (editing) answerField.current?.focus();
  }, [editing]);
  const save = async () => {
    const text = draft.trim();
    if (
      !(onAnswer && text && editing) ||
      disabledReason ||
      submitting.current ||
      question.status !== 'open'
    )
      return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      await onAnswer(editing, text);
      setEditing(undefined);
      setDraft('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
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
      {question.subjects.map((subject, index) => {
        const description = describeTarget?.(subject);
        const title = description?.title || subject.label || 'Subject';
        const href = description?.href;
        const availability =
          subject.state === 'deleted'
            ? 'Subject removed'
            : subject.state === 'missing'
              ? 'Subject unavailable'
              : subject.state === 'unresolved'
                ? 'Subject not linked'
                : subject.state === 'newer'
                  ? 'Newer subject content available'
                  : undefined;
        return (
          <Text key={subject.relationship ?? index} size="sm" tone="muted">
            About{' '}
            {href && isSafeUrl(href) ? (
              <Link href={href}>{description?.navigationLabel ?? title}</Link>
            ) : (
              <Text as="span">{title}</Text>
            )}
            {availability ? ` · ${availability}` : ''}
          </Text>
        );
      })}
      {question.answers.map((answer, index) => {
        const description = describeTarget?.(answer);
        const answerText =
          answer.version?.data?.kind === 'answer'
            ? parseAnswer(answer.version.data).text
            : undefined;
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
          <Stack key={answer.relationship ?? index} gap="xs">
            {!!answerText && <Text>{answerText}</Text>}
            <Text size="sm" tone="muted">
              {href && isSafeUrl(href) ? (
                <Link href={href}>{description?.navigationLabel ?? title}</Link>
              ) : (
                <Text as="span">{title}</Text>
              )}{' '}
              · {availability}
            </Text>
          </Stack>
        );
      })}
      {question.status === 'open' && onAnswer && (
        <>
          {editing ? (
            <Form
              aria-label="Answer question"
              onSubmit={(event) => {
                event.preventDefault();
                return save();
              }}
            >
              <Stack gap="sm">
                <SettingField label="Answer" description="Respond to this question.">
                  <Textarea
                    ref={answerField}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    disabled={pending || !!disabledReason}
                  />
                </SettingField>
                {!!error && (
                  <Text role="alert" tone="danger">
                    {error}
                  </Text>
                )}
                <Row wrap={true}>
                  <Button
                    type="submit"
                    disabled={pending || !!disabledReason || !draft.trim()}
                    aria-describedby={disabledReason ? reasonId : undefined}
                  >
                    {pending ? 'Saving answer…' : 'Save answer'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      setEditing(undefined);
                      setDraft('');
                      setError(undefined);
                    }}
                  >
                    Cancel
                  </Button>
                </Row>
              </Stack>
            </Form>
          ) : (
            <Row>
              <Button
                variant="outline"
                disabled={!!disabledReason}
                aria-describedby={disabledReason ? reasonId : undefined}
                onClick={() => setEditing(question)}
              >
                Answer
              </Button>
            </Row>
          )}
          {!!disabledReason && (
            <Text id={reasonId} size="sm" tone="muted">
              {disabledReason}
            </Text>
          )}
        </>
      )}
    </Stack>
  );
}

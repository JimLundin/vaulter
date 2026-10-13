import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Columns,
  Drawer,
  Field,
  FieldLabel,
  Form,
  Heading,
  Icon,
  Link,
  Row,
  SelectionRow,
  Stack,
  Surface,
  Text,
  Textarea,
} from '../../ui/kit/index.ts';
import { isSafeUrl } from '../../vault/documents/notes/safe-url.ts';
import type { Question, QuestionTarget } from './reading.ts';
import { parseAnswer } from './records.ts';
import type { QuestionAnswers } from './answers.ts';
import { useQuestionAnswerState } from './use-questions.ts';

export interface QuestionTargetDescription {
  readonly title: string;
  /** Foreign source owners supply the text of self-contained exact versions. */
  readonly text?: string;
  /** Navigation opens source context; it does not imply an exact historical answer view. */
  readonly href?: string;
  readonly navigationLabel?: string;
}

export type QuestionAnswerHandler = (question: Question, text: string) => Promise<void>;

export interface QuestionItemProps {
  readonly question: Question;
  readonly describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
  readonly describeAuthor?: (question: Question) => string | undefined;
  readonly onAnswer?: QuestionAnswerHandler;
  readonly answers?: QuestionAnswers;
  readonly disabledReason?: string;
}

interface Draft {
  /** Keep the exact wording that was read when the person began drafting. */
  readonly question: Question;
  readonly choice: string;
  readonly texts: Readonly<Record<string, string>>;
}

/** Balanced drafts: one Questions-owned card reused by the collection and Wiki. */
export function QuestionItem({
  question,
  describeTarget,
  describeAuthor,
  onAnswer,
  answers,
  disabledReason,
}: QuestionItemProps) {
  const [draft, setDraft] = useState<Draft>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const submitting = useRef(false);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const reasonId = useId();
  const answerState = useQuestionAnswerState(answers);
  const attempt = answerState.attempts.find((entry) => entry.question.id === question.id);
  const submitAnswer = answers?.answer ?? onAnswer;
  useLayoutEffect(() => {
    if (focusRequest) answerField.current?.focus();
  }, [focusRequest]);
  const suggestions = (draft?.question ?? question).data.suggestions ?? [];
  const text = draft ? (draft.texts[draft.choice] ?? '') : '';
  const selected = suggestions.find((_, index) => draft?.choice === `suggestion:${index}`);
  const stale =
    !!draft &&
    (draft.question.id !== question.id ||
      draft.question.key.transaction !== question.key.transaction);
  const locked = pending || !!disabledReason || !!attempt;
  const canAnswer = question.status === 'open' && !!submitAnswer;
  const label =
    question.status === 'open'
      ? 'Open question'
      : question.status === 'answered'
        ? 'Answered'
        : 'Abandoned';
  const date =
    question.created &&
    new Date(question.created.at).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const author = describeAuthor?.(question);
  const sources = question.sources ?? [];
  const knowledge = question.knowledge ?? [];
  const sourceTitle =
    sources[0] && (describeTarget?.(sources[0])?.title || sources[0].label || 'Retained source');
  const choose = (choice: string, initial = '') => {
    if (locked || stale) return;
    setDraft((previous) => ({
      question: previous?.question ?? question,
      choice,
      texts: { ...previous?.texts, [choice]: previous?.texts[choice] ?? initial },
    }));
    setError(undefined);
    setFocusRequest((count) => count + 1);
  };
  const save = async () => {
    if (
      !(submitAnswer && draft && text.trim()) ||
      locked ||
      stale ||
      submitting.current ||
      !canAnswer
    )
      return;
    submitting.current = true;
    setPending(true);
    setError(undefined);
    try {
      await submitAnswer(draft.question, text.trim());
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };
  const retry = async () => {
    if (
      !(answers && attempt) ||
      attempt.phase === 'pending' ||
      disabledReason ||
      submitting.current
    )
      return;
    submitting.current = true;
    setError(undefined);
    try {
      await answers.retry(question.id);
      setDraft(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      submitting.current = false;
    }
  };
  return (
    <Card role="region" aria-label={label}>
      <CardHeader>
        <Row justify="between" wrap={true}>
          <Badge>{question.status === 'open' ? 'Open' : label}</Badge>
          {!!(author || date) && (
            <Text size="xs" tone="muted">
              {author ? `Asked by ${author}` : 'Asked'}
              {date ? ` · ${date}` : ''}
            </Text>
          )}
        </Row>
        <Heading level={2}>{question.data.text}</Heading>
        <Targets targets={question.subjects} describeTarget={describeTarget} subject={true} />
      </CardHeader>
      <CardContent>
        <Stack gap="lg">
          {!!question.answers.length && (
            <Targets targets={question.answers} describeTarget={describeTarget} />
          )}
          {!!error && !attempt && !canAnswer && (
            <Text role="alert" tone="danger">
              {error}
            </Text>
          )}
          {!!attempt && (
            <Surface variant="subtle">
              <Stack gap="md" role="group" aria-label="Retained answer">
                <Text size="sm" weight="medium">
                  Original answer
                </Text>
                <Text preserve={true}>{attempt.text}</Text>
                <Text size="sm" tone="muted">
                  For: {attempt.question.data.text}
                </Text>
                <Text role="status" size="sm" tone="muted">
                  {attempt.phase === 'pending'
                    ? 'Saving the original answer…'
                    : 'The save outcome is uncertain. Retry the original answer before starting another draft.'}
                </Text>
                {!!(error || attempt.error) && (
                  <Text role="alert" tone="danger">
                    {error || attempt.error}
                  </Text>
                )}
                <Button
                  type="button"
                  disabled={attempt.phase === 'pending' || !!disabledReason}
                  aria-describedby={disabledReason ? reasonId : undefined}
                  onClick={retry}
                >
                  Retry original answer
                </Button>
                {!!disabledReason && (
                  <Text id={reasonId} size="xs" tone="muted">
                    {disabledReason}
                  </Text>
                )}
              </Stack>
            </Surface>
          )}
          {canAnswer && !attempt ? (
            <Form
              aria-label={`Answer: ${question.data.text}`}
              onSubmit={(event) => {
                event.preventDefault();
                return save();
              }}
            >
              <Columns gap="xl">
                <Stack gap="md" role="group" aria-label={`Answer choices: ${question.data.text}`}>
                  <Stack gap="xs">
                    <Row gap="sm">
                      <Icon name="sparkles" size="sm" />
                      <Text size="sm" weight="medium">
                        Suggested answers
                      </Text>
                    </Row>
                    <Text size="xs" tone="muted">
                      {suggestions.length
                        ? 'Prepared from the source and existing knowledge.'
                        : 'No suggested answers were recorded for this question.'}
                    </Text>
                  </Stack>
                  {suggestions.map((suggestion, index) => (
                    <SelectionRow
                      key={suggestion.title}
                      appearance="card"
                      selected={draft?.choice === `suggestion:${index}`}
                      disabled={locked || stale}
                      onSelect={() => choose(`suggestion:${index}`, suggestion.text)}
                    >
                      <Stack gap="xs" align="start">
                        <Text as="span" size="sm" weight="medium">
                          {suggestion.title}
                        </Text>
                        <Text as="span" size="sm" tone="muted">
                          {suggestion.reason}
                        </Text>
                      </Stack>
                    </SelectionRow>
                  ))}
                  <SelectionRow
                    appearance="card"
                    selected={draft?.choice === 'custom'}
                    disabled={locked || stale}
                    onSelect={() => choose('custom')}
                  >
                    <Stack gap="xs" align="start">
                      <Text as="span" size="sm" weight="medium">
                        Write my own answer
                      </Text>
                      <Text as="span" size="xs" tone="muted">
                        Free text, in your own words.
                      </Text>
                    </Stack>
                  </SelectionRow>
                </Stack>
                <Surface variant="subtle">
                  <Stack gap="md">
                    <Field orientation="vertical">
                      <FieldLabel htmlFor={fieldId}>Your answer</FieldLabel>
                      <Textarea
                        ref={answerField}
                        id={fieldId}
                        aria-describedby={`${fieldId}-description${disabledReason ? ` ${reasonId}` : ''}`}
                        variant="longform"
                        rows={5}
                        placeholder="Choose a suggestion or write your own answer…"
                        value={text}
                        disabled={locked}
                        onChange={(event) => {
                          const next = event.target.value;
                          setDraft((previous) => {
                            const choice = previous?.choice ?? 'custom';
                            return {
                              question: previous?.question ?? question,
                              choice,
                              texts: { ...previous?.texts, [choice]: next },
                            };
                          });
                          setError(undefined);
                        }}
                      />
                      <Text id={`${fieldId}-description`} size="xs" tone="muted">
                        {selected
                          ? `Draft from “${selected.title}”.`
                          : 'Choose a suggestion or write freely.'}
                      </Text>
                    </Field>
                    {stale && (
                      <Stack gap="sm">
                        <Text role="alert" tone="danger">
                          Question has changed; review its current wording before answering.
                        </Text>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={locked}
                          onClick={() => {
                            setDraft({ question, choice: 'custom', texts: { custom: text } });
                            setError(undefined);
                            setFocusRequest((count) => count + 1);
                          }}
                        >
                          Use current question
                        </Button>
                      </Stack>
                    )}
                    {!!error && (
                      <Text role="alert" tone="danger">
                        {error}
                      </Text>
                    )}
                    <Row wrap={true}>
                      <Button
                        type="submit"
                        disabled={locked || stale || !text.trim()}
                        aria-describedby={disabledReason ? reasonId : undefined}
                      >
                        {pending ? 'Saving answer…' : 'Save answer'}
                      </Button>
                    </Row>
                    {!!disabledReason && (
                      <Text id={reasonId} size="xs" tone="muted">
                        {disabledReason}
                      </Text>
                    )}
                  </Stack>
                </Surface>
              </Columns>
            </Form>
          ) : (
            <Text size="sm" tone="muted">
              {question.status === 'answered'
                ? 'This question has a recorded answer.'
                : question.status === 'abandoned'
                  ? 'This question was explicitly abandoned.'
                  : (disabledReason ?? 'Answering is unavailable.')}
            </Text>
          )}
          {!!(sources.length || knowledge.length) && (
            <Row justify="between" wrap={true}>
              <Text size="xs" tone="muted">
                {sourceTitle ? `From ${sourceTitle}` : 'Recorded question context'}
              </Text>
              <Button
                type="button"
                variant="ghost"
                size="compact"
                onClick={() => setContextOpen(true)}
              >
                <Icon name="book" size="sm" />
                Source & context
              </Button>
            </Row>
          )}
        </Stack>
      </CardContent>
      <Drawer
        title="Source & context"
        description={question.data.text}
        open={contextOpen}
        onClose={() => setContextOpen(false)}
      >
        <Stack gap="lg">
          <Grounding
            title="Source of the question"
            targets={sources}
            describeTarget={describeTarget}
          />
          <Grounding
            title="Existing knowledge"
            targets={knowledge}
            describeTarget={describeTarget}
          />
          {!!question.data.suggestions?.length && (
            <Stack gap="sm">
              <Heading level={3}>Why these suggestions?</Heading>
              {question.data.suggestions.map((suggestion) => (
                <Stack key={suggestion.title} gap="xs">
                  <Text size="sm" weight="medium">
                    {suggestion.title}
                  </Text>
                  <Text size="sm" preserve={true}>
                    {suggestion.text}
                  </Text>
                  <Text size="sm" tone="muted">
                    {suggestion.reason}
                  </Text>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      </Drawer>
    </Card>
  );
}

function TargetLink({
  target,
  description,
  fallback,
}: {
  target: QuestionTarget;
  description?: QuestionTargetDescription;
  fallback: string;
}) {
  const title = description?.title || target.label || fallback;
  return description?.href && isSafeUrl(description.href) ? (
    <Link href={description.href} aria-label={description.navigationLabel}>
      {title}
    </Link>
  ) : (
    <Text as="span">{title}</Text>
  );
}

function Targets({
  targets,
  describeTarget,
  subject = false,
}: {
  targets: readonly QuestionTarget[];
  describeTarget?: QuestionItemProps['describeTarget'];
  subject?: boolean;
}) {
  return (
    <Stack gap="sm">
      {targets.map((target, index) => {
        const description = describeTarget?.(target);
        const answerText =
          !subject && target.version?.data?.kind === 'answer'
            ? parseAnswer(target.version.data).text
            : undefined;
        const availability = subject
          ? target.state === 'deleted'
            ? 'Subject removed'
            : target.state === 'missing'
              ? 'Subject unavailable'
              : target.state === 'unresolved'
                ? 'Subject not linked'
                : target.state === 'newer'
                  ? 'Newer subject content available'
                  : undefined
          : target.state === 'deleted'
            ? 'Answer removed; recorded link retained'
            : target.state === 'missing'
              ? 'Answer unavailable; recorded link retained'
              : target.state === 'unresolved'
                ? 'Answer not linked'
                : target.state === 'newer'
                  ? 'Recorded answer; newer content available'
                  : 'Recorded answer';
        return (
          <Stack key={target.relationship ?? index} gap="xs">
            {!!answerText && <Text preserve={true}>{answerText}</Text>}
            <Text size={subject ? 'xs' : 'sm'} tone="muted">
              {subject ? 'About ' : ''}
              <TargetLink
                target={target}
                description={description}
                fallback={subject ? 'Subject' : 'Answer'}
              />
              {availability ? ` · ${availability}` : ''}
            </Text>
          </Stack>
        );
      })}
    </Stack>
  );
}

function Grounding({
  title,
  targets,
  describeTarget,
}: {
  title: string;
  targets: readonly QuestionTarget[];
  describeTarget?: QuestionItemProps['describeTarget'];
}) {
  return (
    <Stack gap="sm">
      <Text size="xs" tone="muted">
        {title}
      </Text>
      {!targets.length && (
        <Text size="sm" tone="muted">
          No context recorded.
        </Text>
      )}
      {targets.map((target, index) => {
        const description = describeTarget?.(target);
        return (
          <Stack key={target.relationship ?? index} gap="xs">
            <Text size="sm" weight="medium">
              <TargetLink target={target} description={description} fallback="Retained context" />
            </Text>
            {description?.text ? (
              <Surface variant="grouped">
                <Text size="sm" preserve={true}>
                  “{description.text}”
                </Text>
              </Surface>
            ) : (
              <Text size="sm" tone="muted">
                Recorded context unavailable.
              </Text>
            )}
            {target.state !== 'available' && (
              <Text size="sm" tone="muted">
                {target.state === 'newer'
                  ? 'Recorded context; newer content available.'
                  : target.state === 'deleted'
                    ? 'Context removed; recorded version retained.'
                    : 'Recorded context unavailable.'}
              </Text>
            )}
          </Stack>
        );
      })}
    </Stack>
  );
}

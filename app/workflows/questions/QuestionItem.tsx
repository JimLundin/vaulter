import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Drawer,
  Heading,
  Icon,
  Link,
  PromptSuggestions,
  Row,
  Stack,
  Surface,
  Text,
  TextBox,
  VoiceStatus,
} from '../../ui/kit/index.ts';
import type { Transcription } from '../../transcription.ts';
import { isSafeUrl } from '../../vault/documents/notes/safe-url.ts';
import type { Question, QuestionTarget } from './reading.ts';
import { parseAnswer } from './records.ts';
import type { QuestionAnswers } from './answers.ts';
import { useQuestionAnswerState } from './use-questions.ts';
import { useAnswerDictation } from './use-answer-dictation.ts';

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
  readonly transcription?: Transcription;
}

interface Draft {
  /** Keep the exact wording that was read when the person began drafting. */
  readonly question: Question;
  readonly choice: string;
  readonly texts: Readonly<Record<string, string>>;
}

/** One Questions-owned card, with the same suggestions and text entry used by Chat. */
export function QuestionItem({
  question,
  describeTarget,
  describeAuthor,
  onAnswer,
  answers,
  disabledReason,
  transcription,
}: QuestionItemProps) {
  const [draft, setDraft] = useState<Draft>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [contextOpen, setContextOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const submitting = useRef(false);
  const answerField = useRef<HTMLTextAreaElement>(null);
  const reasonId = useId();
  const answerState = useQuestionAnswerState(answers);
  const attempt = answerState.attempts.find((entry) => entry.question.id === question.id);
  const submitAnswer = answers?.answer ?? onAnswer;
  useLayoutEffect(() => {
    if (focusRequest) answerField.current?.focus();
  }, [focusRequest]);
  const suggestions = (draft?.question ?? question).data.suggestions ?? [];
  const text = draft ? (draft.texts[draft.choice] ?? '') : '';
  const stale =
    !!draft &&
    (draft.question.id !== question.id ||
      draft.question.key.transaction !== question.key.transaction);
  const locked = pending || !!disabledReason || !!attempt;
  const canAnswer = question.status === 'open' && !!submitAnswer;
  const edit = (next: string) => {
    setDraft((previous) => {
      const choice = previous?.choice ?? 'custom';
      return {
        question: previous?.question ?? question,
        choice,
        texts: { ...previous?.texts, [choice]: next },
      };
    });
    setError(undefined);
  };
  const dictation = useAnswerDictation({
    transcription,
    question,
    choice: draft?.choice ?? 'custom',
    text,
    onText: edit,
    disabled: locked || stale || !canAnswer,
  });
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
  const hasContext = !!(
    sources.length ||
    knowledge.length ||
    question.data.suggestions?.length ||
    author ||
    date
  );
  const choose = (choice: string, initial = '') => {
    if (locked || stale || dictation.recording()) return;
    dictation.cancel();
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
      dictation.recording() ||
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
        <Row justify="between" align="start">
          <Stack gap="sm" grow={true}>
            <Heading level={2}>{question.data.text}</Heading>
            {!!(question.subjects.length || question.status !== 'open') && (
              <Row wrap={true}>
                {question.status !== 'open' && <Badge>{label}</Badge>}
                <Targets
                  targets={question.subjects}
                  describeTarget={describeTarget}
                  subject={true}
                />
              </Row>
            )}
          </Stack>
          {hasContext && (
            <Button
              type="button"
              variant="ghost"
              size="compact"
              iconOnly={true}
              aria-label="Source & context"
              title="Source & context"
              onClick={() => setContextOpen(true)}
            >
              <Icon name="book" size="sm" />
            </Button>
          )}
        </Row>
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
            <Stack gap="sm">
              <PromptSuggestions
                label="Suggested answers"
                suggestions={
                  suggestions.length
                    ? [
                        ...suggestions.map((suggestion, index) => ({
                          value: `suggestion:${index}`,
                          label: suggestion.title,
                        })),
                        { value: 'custom', label: 'Write my own' },
                      ]
                    : []
                }
                selected={draft?.choice ?? ''}
                disabled={locked || stale || dictation.active}
                onSelect={(choice) =>
                  choose(
                    choice,
                    suggestions.find((_, index) => choice === `suggestion:${index}`)?.text,
                  )
                }
              />
              {dictation.active && <VoiceStatus phase={dictation.phase} error="" />}
              <TextBox
                label="Your answer"
                fieldRef={answerField}
                placeholder="Write an answer…"
                draft={text}
                disabled={locked}
                busy={pending}
                readOnly={dictation.active}
                canSubmit={!(locked || stale || dictation.active)}
                voice={
                  transcription
                    ? {
                        phase: dictation.phase,
                        disabled: !dictation.allowed,
                        onClick: () => {
                          void dictation.action();
                        },
                      }
                    : undefined
                }
                submitLabel="Save answer"
                pendingLabel="Saving answer…"
                description={disabledReason}
                error={
                  stale
                    ? 'Question has changed; review its current wording before answering.'
                    : error || dictation.error
                }
                onDraftChange={(next) => {
                  dictation.cancel();
                  edit(next);
                }}
                onSubmit={save}
              />
              {stale && (
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
              )}
            </Stack>
          ) : !attempt && question.status === 'open' ? (
            <Text size="sm" tone="muted">
              {disabledReason ?? 'Answering is unavailable.'}
            </Text>
          ) : null}
        </Stack>
      </CardContent>
      <Drawer
        title="Source & context"
        description={question.data.text}
        open={contextOpen}
        onClose={() => setContextOpen(false)}
      >
        <Stack gap="lg">
          {!!(author || date) && (
            <Text size="xs" tone="muted">
              {author ? `Asked by ${author}` : 'Asked'}
              {date ? ` · ${date}` : ''}
            </Text>
          )}
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

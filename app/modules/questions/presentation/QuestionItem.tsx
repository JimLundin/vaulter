import type { QuestionAnswerHandler } from '@/modules/questions/answers.ts';
import { useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Heading,
  Link,
  PromptSuggestions,
  Row,
  Stack,
  Surface,
  Text,
  TextBox,
  VoiceStatus,
} from '@/shared/ui/kit/index.ts';
import type { Transcription } from '@/modules/transcription/index.ts';
import { isSafeUrl } from '@/shared/browser/urls.ts';
import type { Question, QuestionTarget } from '@/modules/questions/reading.ts';
import type { QuestionAnswers } from '@/modules/questions/answers.ts';
import { useQuestionAnswerState } from '@/modules/questions/presentation/use-questions.ts';
import { useAnswerDictation } from '@/modules/questions/presentation/use-answer-dictation.ts';

const sourceSentences = new Intl.Segmenter(undefined, { granularity: 'sentence' });

export interface QuestionTargetDescription {
  readonly title: string;
  /** Foreign source owners supply the text of self-contained exact versions. */
  readonly text?: string;
  /** Navigation opens source context; it does not imply an exact historical answer view. */
  readonly href?: string;
  readonly navigationLabel?: string;
}

export interface QuestionItemProps {
  readonly question: Question;
  readonly describeTarget?: (target: QuestionTarget) => QuestionTargetDescription | undefined;
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
  onAnswer,
  answers,
  disabledReason,
  transcription,
}: QuestionItemProps) {
  const [draft, setDraft] = useState<Draft>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
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
      draft.question.evidence.transaction !== question.evidence.transaction);
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
  const sourceText = question.sources
    ?.map((source) => describeTarget?.(source)?.text?.replace(/\s+/g, ' ').trim())
    .find((value) => value);
  const firstSentence =
    sourceText && sourceSentences.segment(sourceText).containing(0)?.segment.trim();
  const context =
    firstSentence && firstSentence.length > 120
      ? `${firstSentence.slice(0, 117).replace(/\s+\S*$/, '')}…`
      : firstSentence;
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
        <Stack gap="sm">
          <Heading level={2}>{question.data.text}</Heading>
          {!!context && (
            <Text size="sm" tone="muted">
              {context}
            </Text>
          )}
          {!!(question.subjects.length || question.status !== 'open') && (
            <Row wrap={true}>
              {question.status !== 'open' && <Badge>{label}</Badge>}
              <Targets targets={question.subjects} describeTarget={describeTarget} subject={true} />
            </Row>
          )}
        </Stack>
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
                suggestions={suggestions.map((suggestion, index) => ({
                  value: `suggestion:${index}`,
                  label: suggestion.title,
                }))}
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
      {targets.map((target) => {
        const description = describeTarget?.(target);
        const answerText = !subject ? target.text : undefined;
        const availability = subject
          ? target.state === 'deleted'
            ? 'Subject removed'
            : target.state === 'newer'
              ? 'Newer subject content available'
              : undefined
          : target.state === 'deleted'
            ? 'Answer removed; recorded link retained'
            : target.state === 'newer'
              ? 'Recorded answer; newer content available'
              : 'Recorded answer';
        return (
          <Stack key={`${target.evidence.entity}:${target.evidence.transaction}`} gap="xs">
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

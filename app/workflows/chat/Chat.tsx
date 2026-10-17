import { Timeline } from './Timeline.tsx';
// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  TextBox,
  PromptSuggestions,
  VoiceStatus,
  Row,
  Stack,
  Text,
} from '@/ui/kit/index.ts';
import { ConversationList } from './ConversationList.tsx';
import { ChatSurface, ChatWelcome, type ChatPresentation } from './ChatSurface.tsx';
import { ChatMessage } from './ChatMessage.tsx';
import { later } from '@/runtime/later.ts';
import type { Conversation, Prompt, ChatSubmissionIntent } from './conversation.ts';
export type { Prompt } from './conversation.ts';
import { useChat } from './use-conversation.ts';
import { model } from './model.ts';
import type { ToolPresentationAdapter } from '@/agent/tool-presentation.tsx';

export function Chat({
  conversation,
  arg,
  presentation,
  toolPresentations,
}: {
  conversation: Conversation;
  arg: Prompt | null;
  presentation: ChatPresentation;
  toolPresentations?: readonly ToolPresentationAdapter[];
}) {
  const { newChat, stop, viewing } = conversation;
  const [choosing, setChoosing] = useState(false);
  const [scrollTarget, setScrollTarget] = useState<{ index: number; request: number }>();
  const showChats = () => setChoosing(true);
  const {
    draft: input,
    turns,
    suggestions,
    busy,
    contentAccepted,
    recovery,
    phase,
    capture,
    submissionAvailability,
    selection,
    actionReason,
    prompts,
  } = useChat(conversation);
  const [focused, setFocused] = useState(false);
  const recording = ['connecting', 'listening', 'finishing'].includes(capture.phase);
  const visible = presentation.page || presentation.open;
  const chooser = (
    <ConversationList
      conversation={conversation}
      open={visible && choosing}
      persistent={visible}
      onClose={() => setChoosing(false)}
    />
  );
  const ref = useRef<HTMLTextAreaElement>(null);
  const type = conversation.setDraft;
  const say = useCallback(
    (intent: ChatSubmissionIntent) => {
      const outcome = conversation.prepareSubmission(intent);
      if (outcome.status === 'owned') later(outcome.done);
    },
    [conversation],
  );
  useEffect(() => {
    if (visible) return viewing();
  }, [viewing, visible]);
  const selectedModel = model();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat or model invalidates cached suggestions
  useEffect(() => {
    if (visible && !(focused || input || busy || recording)) later(conversation.suggest());
  }, [
    conversation,
    focused,
    input,
    busy,
    conversation.conversation(),
    turns.length,
    selectedModel,
    recording,
    visible,
  ]);
  const showSuggestions = !(focused || input || busy || recording) && suggestions.length > 0;
  useEffect(() => {
    if (!(visible && arg)) return;
    const outcome = conversation.receivePrompt(arg);
    if (outcome.status === 'owned') later(outcome.done);
    if (outcome.status === 'edited') requestAnimationFrame(() => ref.current?.focus());
  }, [arg, conversation, visible]);
  const edit = (text: string) => {
    const outcome = conversation.editDraft(text);
    if (outcome.status === 'edited') requestAnimationFrame(() => ref.current?.focus());
  };
  return (
    <ChatSurface
      supporting={
        conversation.continuous ? (
          <Timeline
            conversation={conversation}
            open={visible && choosing}
            persistent={visible && !!presentation.page}
            onClose={() => setChoosing(false)}
            onJump={(index) =>
              setScrollTarget((prior) => ({ index, request: (prior?.request ?? 0) + 1 }))
            }
          />
        ) : (
          chooser
        )
      }
      onTimeline={conversation.continuous ? showChats : undefined}
      scrollTarget={scrollTarget}
      presentation={presentation}
      onNewChat={conversation.continuous ? undefined : newChat}
      onConversations={conversation.continuous ? undefined : showChats}
      empty={!turns.length}
      busy={!conversation.snapshot().selectionAvailability.allowed}
      status={
        <Stack>
          {prompts.map((prompt) => (
            <Stack key={prompt.n}>
              <Text>{prompt.text}</Text>
              <Text role="status" tone="subtle">
                {prompt.reason}
              </Text>
              <Row justify="end">
                <Button variant="outline" onClick={() => conversation.dismissPrompt(prompt.n)}>
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    const outcome = conversation.applyPrompt(prompt.n);
                    if (outcome.status === 'owned') later(outcome.done);
                    if (outcome.status === 'edited')
                      requestAnimationFrame(() => ref.current?.focus());
                  }}
                >
                  Use
                </Button>
              </Row>
            </Stack>
          ))}
          {!!selection.pending && <Text role="status">Opening conversation…</Text>}
          {!!selection.reason && <Text role="status">{selection.reason}</Text>}
          {!!selection.error && (
            <Text role="alert" tone="danger">
              {selection.error}
            </Text>
          )}
          {!!actionReason && (
            <Text role="alert" tone="danger">
              {actionReason}
            </Text>
          )}
          <VoiceStatus phase={capture.phase} error={capture.error} />
          {!!conversation.availability() && (
            <Text role="status" tone="subtle">
              {conversation.availability()}
            </Text>
          )}
          {!!recovery.content && (
            <Stack>
              <Text role="alert" tone="danger">
                Content save: {recovery.content.error}. Acceptance is uncertain; the tool will not
                be repeated.
              </Text>
              <Button
                disabled={!recovery.content.allowed}
                onClick={() => later(conversation.retryContentSave())}
              >
                {recovery.content.inProgress ? 'Saving content…' : 'Retry content save'}
              </Button>
            </Stack>
          )}
          {contentAccepted && (
            <Text role="status" tone="subtle">
              Content save accepted. The original tool outcome is retained.
            </Text>
          )}
          {!!recovery.refresh && (
            <Stack>
              <Text role="alert" tone="danger">
                Content view could not refresh: {recovery.refresh.error}. Accepted changes are
                retained.
              </Text>
              <Button
                disabled={!recovery.refresh.allowed}
                onClick={() => later(conversation.refreshContext())}
              >
                {recovery.refresh.inProgress ? 'Refreshing…' : 'Refresh records'}
              </Button>
            </Stack>
          )}
          {recovery.save ? (
            <Stack>
              <Text role="alert" tone="danger">
                {recovery.save.label}: {recovery.save.error}
              </Text>
              <Button
                disabled={!recovery.save.allowed}
                onClick={() => later(conversation.retrySave())}
              >
                {recovery.save.inProgress ? 'Saving…' : 'Retry save'}
              </Button>
            </Stack>
          ) : phase === 'recorded' ? (
            <Text role="status" tone="subtle">
              Message saved. The recorded Agent run was not resumed; its outcome remains unknown.
            </Text>
          ) : phase === 'accepting' || phase === 'saving' ? (
            <Text role="status" tone="subtle">
              Saving…
            </Text>
          ) : null}
        </Stack>
      }
      suggestions={
        showSuggestions ? (
          <PromptSuggestions
            suggestions={suggestions.map((text) => ({ value: text, label: text }))}
            onSelect={edit}
          />
        ) : null
      }
      composer={
        <TextBox
          draft={input}
          onDraftChange={type}
          onSubmit={() => say(conversation.draftIntent())}
          label="Message"
          placeholder={busy ? 'Working…' : recording ? 'Start speaking…' : 'Type a message…'}
          canSubmit={submissionAvailability.allowed}
          busy={busy}
          readOnly={recording}
          voice={{
            phase: capture.phase,
            disabled: !capture.allowed,
            onClick: () => later(conversation.captureAction()),
          }}
          onStop={stop}
          fieldRef={ref}
          onFocusChange={setFocused}
        />
      }
    >
      {!turns.length && <ChatWelcome />}
      {turns.map((turn, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: accepted turns append in dialogue order
        <Stack key={i} data-scroll-anchor={i}>
          <ChatMessage
            turn={turn}
            live={busy && i === turns.length - 1}
            toolPresentations={toolPresentations}
          />
        </Stack>
      ))}
    </ChatSurface>
  );
}

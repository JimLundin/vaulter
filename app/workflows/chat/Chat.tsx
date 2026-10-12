// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  CodeDiff,
  Composer,
  PromptSuggestions,
  VoiceStatus,
  Overlay,
  Row,
  Stack,
  Text,
} from '../../ui/kit/index.ts';
import { ConversationList } from './ConversationList.tsx';
import { ChatSurface, ChatWelcome, type ChatPresentation } from './ChatSurface.tsx';
import { ChatMessage } from './ChatMessage.tsx';
import { later } from '../../ui/later.ts';
import type { NodeConversation, Prompt } from './node-conversation.ts';
export type { Prompt } from './node-conversation.ts';
import { useNodeChat } from './use-node-conversation.ts';
import { model } from './model.ts';

export function Chat({
  conversation,
  arg,
  presentation,
}: {
  conversation: NodeConversation;
  arg: Prompt | null;
  presentation: ChatPresentation;
}) {
  const { newChat, send, stop, viewing } = conversation;
  const [choosing, setChoosing] = useState(false);
  const showChats = () => setChoosing(true);
  const {
    draft: input,
    turns,
    suggestions,
    busy,
    persistenceError,
    persistenceStage,
    contentPersistence,
    contentAccepted,
    contextError,
    phase,
    capture,
  } = useNodeChat(conversation);
  const [retrying, setRetrying] = useState(false);
  const [focused, setFocused] = useState(false);
  const recording = ['connecting', 'listening', 'finishing'].includes(capture.phase);
  const visible = presentation.page || presentation.open;
  const chooser = (
    <ConversationList
      conversation={conversation}
      disabled={recording}
      open={visible && choosing}
      persistent={visible}
      onClose={() => setChoosing(false)}
    />
  );
  const [review, setReview] = useState<{
    text: string;
    files: ReturnType<NodeConversation['stagedChanges']>;
  } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const type = conversation.setDraft;
  const say = useCallback(
    (text: string) => {
      const files = conversation.stagedChanges();
      if (files.length) {
        type(text);
        setReview({ text, files });
        return;
      }
      type('');
      later(send(text));
    },
    [type, send, conversation],
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
    if (!(visible && arg && conversation.takePrompt(arg))) return;
    if (arg.send && !conversation.snapshot().busy) say(arg.text);
    else {
      type(arg.text);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [arg, conversation, say, type, visible]);
  const edit = (text: string) => {
    type(text);
    requestAnimationFrame(() => ref.current?.focus());
  };
  if (!(conversation.ready() || turns.length || persistenceError))
    return (
      <ChatSurface
        supporting={chooser}
        presentation={presentation}
        onNewChat={newChat}
        onConversations={showChats}
        busy={false}
        composer={null}
      >
        <Text tone="muted">{conversation.availability() ?? 'Opening the node store…'}</Text>
      </ChatSurface>
    );
  return (
    <ChatSurface
      supporting={chooser}
      presentation={presentation}
      onNewChat={newChat}
      onConversations={showChats}
      empty={!turns.length}
      busy={busy || recording || !!persistenceError || !!contentPersistence || !!contextError}
      status={
        <Stack>
          <VoiceStatus phase={capture.phase} error={capture.error} />
          {!!conversation.availability() && (
            <Text role="status" tone="subtle">
              {conversation.availability()}
            </Text>
          )}
          {contentPersistence && (
            <Stack>
              <Text role="alert" tone="danger">
                Content save: {contentPersistence.error}. Acceptance is uncertain; the tool will not
                be repeated.
              </Text>
              <Button
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  later(conversation.retryContentSave().finally(() => setRetrying(false)));
                }}
              >
                Retry content save
              </Button>
            </Stack>
          )}
          {contentAccepted && (
            <Text role="status" tone="subtle">
              Content save accepted. The original tool outcome is retained.
            </Text>
          )}
          {contextError && (
            <Stack>
              <Text role="alert" tone="danger">
                Content view could not refresh: {contextError}. Accepted changes are retained.
              </Text>
              <Button
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  later(conversation.refreshContext().finally(() => setRetrying(false)));
                }}
              >
                Refresh records
              </Button>
            </Stack>
          )}
          {persistenceError ? (
            <Stack>
              <Text role="alert" tone="danger">
                {saveLabel(persistenceStage)}: {persistenceError}
              </Text>
              <Button
                disabled={retrying}
                onClick={() => {
                  setRetrying(true);
                  later(conversation.retrySave().finally(() => setRetrying(false)));
                }}
              >
                {retrying ? 'Saving…' : 'Retry save'}
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
        showSuggestions ? <PromptSuggestions suggestions={suggestions} onSelect={edit} /> : null
      }
      composer={
        <Composer
          draft={input}
          onDraftChange={type}
          onSubmit={(text) => {
            if (text.trim() && !(busy || recording)) say(text);
          }}
          label="Message"
          placeholder={busy ? 'Working…' : recording ? 'Start speaking…' : 'Type a message…'}
          canSubmit={
            conversation.ready() &&
            !(recording || persistenceError || contentPersistence || contextError)
          }
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
        // biome-ignore lint/suspicious/noArrayIndexKey: turns only append
        <ChatMessage key={i} turn={turn} live={busy && i === turns.length - 1} />
      ))}

      <Overlay
        open={!!review}
        onClose={() => setReview(null)}
        title="Review pending changes"
        description="These legacy file edits remain staged. Sending this message creates nodes and leaves these edits unchanged."
      >
        <Stack>
          {review?.files.map((file) => (
            <CodeDiff
              key={file.path}
              path={file.path}
              before={file.before}
              after={file.text ?? ''}
            />
          ))}
          <Row justify="end">
            <Button variant="outline" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                if (!review) return;
                const pending = review;
                setReview(null);
                type('');
                later(send(pending.text));
              }}
            >
              Send and keep staged edits
            </Button>
          </Row>
        </Stack>
      </Overlay>
    </ChatSurface>
  );
}

function saveLabel(stage: ReturnType<NodeConversation['snapshot']>['persistenceStage']) {
  switch (stage) {
    case 'initial':
      return 'Message and Agent run need saving';
    case 'invocation':
      return 'Tool invocation needs saving before it can execute';
    case 'outcome':
      return 'Completed tool outcome needs saving; execution is paused';
    case 'response':
      return 'Chat response needs saving';
    case 'terminal':
      return 'Agent completion needs saving';
    case 'content':
      return 'Content publication needs recovery';
    default:
      return 'Agent activity needs saving';
  }
}

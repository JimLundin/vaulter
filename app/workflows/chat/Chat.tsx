// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Form,
  CodeDiff,
  Composer,
  ComposerActions,
  SendButton,
  ConversationFeed,
  ConversationSurface,
  ConversationWelcome,
  PromptSuggestions,
  VoiceStatus,
  VoiceButton,
  Json,
  Link,
  Markdown,
  Message,
  Overlay,
  Row,
  Stack,
  Text,
  InputGroup,
  InputGroupTextarea,
  ToolResult,
} from '../../ui/kit/index.ts';
import { link } from '../../ui/routing.ts';
import { later } from '../../ui/later.ts';
import { renderBody } from './rendering/markdown.ts';
import { type Conversation, type Part, type Turn, useChat } from './conversation.ts';
import { model } from './model.ts';
import { useTranscript, type Transcription } from './transcription.ts';

export interface Prompt {
  text: string;
  send: boolean;
  n: number;
}
export function Chat({
  conversation,
  arg,
  historyHref,
  voice,
}: {
  conversation: Conversation;
  arg: Prompt | null;
  historyHref?: string;
  voice: Transcription;
}) {
  const { chat, newChat, send, stop, viewing } = conversation;
  const { draft: input, turns, suggestions, busy } = useChat(conversation);
  const [focused, setFocused] = useState(false);
  const transcript = useTranscript(voice);
  const recording = ['connecting', 'listening', 'finishing'].includes(transcript.phase);
  const [review, setReview] = useState<{
    text: string;
    files: ReturnType<Conversation['stagedChanges']>;
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
      voice.clear();
      later(send(text));
    },
    [type, send, conversation, voice],
  );
  useEffect(viewing, [viewing]);
  const selectedModel = model();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat or model invalidates cached suggestions
  useEffect(() => {
    if (!(focused || input || busy || recording)) later(conversation.suggest());
  }, [conversation, focused, input, busy, chat.id, turns.length, selectedModel, recording]);
  const showSuggestions = !(focused || input || busy || recording) && suggestions.length > 0;
  useEffect(() => {
    if (!arg || arg.n === chat.arg) return;
    chat.arg = arg.n;
    if (arg.send && !chat.state.busy) say(arg.text);
    else {
      type(arg.text);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [arg, chat, say, type]);
  const edit = (text: string) => {
    type(text);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const voiceAction = () => {
    if (transcript.phase === 'connecting') {
      voice.clear();
      return;
    }
    if (busy) {
      return;
    }
    if (transcript.phase === 'listening') later(voice.finish());
    else later(voice.start());
  };
  if (!conversation.ready())
    return (
      <ConversationSurface
        historyHref={historyHref ? link(historyHref) : undefined}
        onNewChat={newChat}
        busy={false}
        composer={null}
      >
        <ConversationFeed>
          <Text tone="muted">The agent needs an OpenAI key and a writable vault.</Text>
        </ConversationFeed>
      </ConversationSurface>
    );
  return (
    <ConversationSurface
      historyHref={historyHref ? link(historyHref) : undefined}
      onNewChat={() => {
        voice.clear();
        newChat();
        type('');
      }}
      busy={busy || recording}
      status={<VoiceStatus phase={transcript.phase} error={transcript.error} />}
      suggestions={
        showSuggestions ? <PromptSuggestions suggestions={suggestions} onSelect={edit} /> : null
      }
      composer={
        <Composer>
          <Form
            layout="inline"
            onSubmit={(event) => {
              event.preventDefault();
              if (input.trim() && !(busy || recording)) say(input);
            }}
          >
            <InputGroup variant="composer">
              <InputGroupTextarea
                variant="inline"
                ref={ref}
                rows={1}
                aria-label="Message"
                placeholder={busy ? 'Working…' : recording ? 'Start speaking…' : 'Type a message…'}
                value={input}
                disabled={busy}
                readOnly={recording}
                aria-busy={recording}
                onChange={(event) => {
                  voice.clear();
                  type(event.currentTarget.value);
                }}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={(event) => {
                  // Safari can report Enter confirming composed text with keyCode 229.
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing &&
                    event.nativeEvent.keyCode !== 229
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <ComposerActions
                voice={<VoiceButton phase={transcript.phase} busy={busy} onClick={voiceAction} />}
              >
                <SendButton
                  busy={busy}
                  focused={focused}
                  disabled={!input.trim() || recording}
                  onStop={stop}
                />
              </ComposerActions>
            </InputGroup>
          </Form>
        </Composer>
      }
    >
      <ConversationFeed empty={!turns.length}>
        {!turns.length && (
          <ConversationWelcome
            title="What’s on your mind?"
            description="Speak to the agent, or type what to file and ask what your vault knows."
          />
        )}
        {turns.map((turn, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: turns only append
          <Message key={i} user={turn.role === 'user'}>
            {turn.role === 'user' ? (
              turn.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')
            ) : (
              <AgentTurn
                turn={turn}
                live={busy && i === turns.length - 1}
                historyHref={historyHref}
              />
            )}
          </Message>
        ))}
      </ConversationFeed>

      <Overlay
        open={!!review}
        onClose={() => setReview(null)}
        title="Review pending changes"
        description="These edits are already staged. The agent can change and commit them during this turn."
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
                voice.clear();
                later(
                  send(
                    pending.text,
                    undefined,
                    pending.files.map(({ path, text }) => ({ path, text })),
                  ),
                );
              }}
            >
              Include changes and send
            </Button>
          </Row>
        </Stack>
      </Overlay>
    </ConversationSurface>
  );
}
function Said({ text }: { text: string }) {
  const body = useMemo(() => renderBody({ id: 'agent', path: 'agent.md', body: text }), [text]);
  return <Markdown>{body}</Markdown>;
}
function Tool({ part }: { part: Part & { kind: 'tool' } }) {
  return (
    <ToolResult
      title={part.input ? `${part.name} · ${part.input}` : part.name}
      status={part.result}
      error={part.error}
      input={part.args}
      output={part.result !== undefined ? <Json value={part.output} /> : undefined}
    />
  );
}
function AgentTurn({
  turn,
  live,
  historyHref,
}: {
  turn: Turn;
  live: boolean;
  historyHref?: string;
}) {
  return (
    <Stack>
      {turn.parts.map((part, i) =>
        part.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts only append
          <Said key={i} text={part.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts only append
          <Stack key={i}>
            <Tool part={part} />
            {!!part.commit && !!historyHref && <Link href={link(historyHref)}>{part.result}</Link>}
          </Stack>
        ),
      )}
      {live && !turn.parts.length && (
        <Text size="sm" tone="subtle">
          Thinking…
        </Text>
      )}
      {!!turn.error && (
        <Text size="sm" tone="danger">
          {turn.error}
        </Text>
      )}
      {!!(turn.model || turn.tokens) && (
        <Text size="xs" tone="subtle">
          {[
            turn.model,
            turn.tokens &&
              `${turn.tokens.in.toLocaleString()} in · ${turn.tokens.out.toLocaleString()} out`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
    </Stack>
  );
}

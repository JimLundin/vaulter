// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CodeDiff,
  Composer,
  ComposerActions,
  ConversationFeed,
  ConversationSurface,
  ConversationWelcome,
  ConversationInput,
  PromptSuggestions,
  VoiceTranscript,
  VoiceButton,
  Icon,
  Json,
  Link,
  Markdown,
  Message,
  Overlay,
  Row,
  Stack,
  Text,
  Textarea,
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
  previewVoice,
}: {
  conversation: Conversation;
  arg: Prompt | null;
  historyHref?: string;
  voice: Transcription;
  previewVoice?: boolean;
}) {
  const { chat, newChat, send, stop, viewing } = conversation;
  const { turns, suggestions, busy } = useChat(conversation);
  const [input, setInput] = useState(chat.draft);
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(!!chat.draft);
  const transcript = useTranscript(voice);
  const recording = ['connecting', 'listening', 'finishing'].includes(transcript.phase);
  const [review, setReview] = useState<{
    text: string;
    files: ReturnType<Conversation['stagedChanges']>;
  } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const type = useCallback(
    (text: string) => {
      chat.draft = text;
      setInput(text);
    },
    [chat],
  );
  const say = useCallback(
    (text: string) => {
      const files = conversation.stagedChanges();
      if (files.length) {
        type(text);
        setTyping(true);
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
  useEffect(() => {
    if (recording) setTyping(false);
  }, [recording]);
  const selectedModel = model();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat or model invalidates cached suggestions
  useEffect(() => {
    if (!(focused || input || busy || recording)) later(conversation.suggest());
  }, [conversation, focused, input, busy, chat.id, turns.length, selectedModel, recording]);
  const showSuggestions =
    !(focused || input || busy || recording || transcript.text) && suggestions.length > 0;
  useEffect(() => {
    if (!arg || arg.n === chat.arg) return;
    chat.arg = arg.n;
    if (arg.send && !chat.state.busy) say(arg.text);
    else {
      type(arg.text);
      setTyping(true);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [arg, chat, say, type]);
  const edit = (text: string) => {
    type(text);
    setTyping(true);
    requestAnimationFrame(() => ref.current?.focus());
  };
  const voiceAction = () => {
    if (transcript.phase === 'connecting') {
      voice.clear();
      return;
    }
    if (busy) {
      stop();
      return;
    }
    if (transcript.phase === 'listening') later(voice.finish());
    else if (transcript.phase === 'ready') {
      const { text } = transcript;
      voice.clear();
      say(text);
    } else later(voice.start());
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
        setTyping(false);
      }}
      busy={busy || recording}
      voiceControl={<VoiceButton phase={transcript.phase} busy={busy} onClick={voiceAction} />}
      suggestions={
        showSuggestions ? <PromptSuggestions suggestions={suggestions} onSelect={edit} /> : null
      }
      composer={
        <ConversationInput
          open={typing}
          onOpen={() => {
            if (recording) voice.interrupt();
            setTyping(true);
            requestAnimationFrame(() => ref.current?.focus());
          }}
          onClose={() => {
            setTyping(false);
            ref.current?.blur();
          }}
        >
          <Composer>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (input.trim() && !(busy || recording)) say(input);
              }}
            >
              <Textarea
                ref={ref}
                rows={1}
                aria-label="Message"
                placeholder={busy ? 'Working…' : 'Type a message…'}
                value={input}
                disabled={busy || recording}
                onChange={(event) => type(event.currentTarget.value)}
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
                voice={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    aria-label={
                      transcript.phase === 'listening'
                        ? 'Finish recording'
                        : transcript.phase === 'ready'
                          ? 'Send transcript'
                          : 'Dictate'
                    }
                    disabled={
                      busy || transcript.phase === 'connecting' || transcript.phase === 'finishing'
                    }
                    onClick={voiceAction}
                  >
                    <Icon
                      name={
                        transcript.phase === 'listening'
                          ? 'stop'
                          : transcript.phase === 'ready'
                            ? 'arrow-up'
                            : 'mic'
                      }
                    />
                  </Button>
                }
              >
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-lg"
                    aria-label="Stop"
                    onClick={stop}
                  >
                    <Icon name="stop" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    size="icon-lg"
                    aria-label="Send"
                    disabled={!input.trim() || recording}
                  >
                    <Icon name="arrow-up" />
                  </Button>
                )}
              </ComposerActions>
            </form>
          </Composer>
        </ConversationInput>
      }
    >
      <ConversationFeed empty={!turns.length && transcript.phase === 'idle'}>
        {!turns.length && transcript.phase === 'idle' && (
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
        {transcript.phase !== 'idle' && (
          <VoiceTranscript
            phase={transcript.phase}
            text={transcript.text}
            error={transcript.error}
            preview={previewVoice}
            onEdit={() => {
              edit(transcript.text);
              voice.clear();
            }}
            onDiscard={() => voice.clear()}
          />
        )}
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

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
  DictateButton,
  useIsMobile,
} from '../../ui/kit/index.ts';
import { link } from '../../ui/routing.ts';
import { later } from '../../ui/later.ts';
import { renderBody } from './rendering/markdown.ts';
import { type Conversation, type Part, type Turn, useChat } from './conversation.ts';
import { model } from './model.ts';

export interface Prompt {
  text: string;
  send: boolean;
  n: number;
}
export function Chat({
  conversation,
  arg,
  historyHref,
}: {
  conversation: Conversation;
  arg: Prompt | null;
  historyHref?: string;
}) {
  const { chat, newChat, send, stop, viewing } = conversation;
  const { turns, suggestions, busy } = useChat(conversation);
  const [input, setInput] = useState(chat.draft);
  const [focused, setFocused] = useState(false);
  const [review, setReview] = useState<{
    text: string;
    files: ReturnType<Conversation['stagedChanges']>;
  } | null>(null);
  const mobile = useIsMobile();
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
        setReview({ text, files });
        return;
      }
      type('');
      later(send(text));
    },
    [type, send, conversation],
  );
  useEffect(viewing, [viewing]);
  const selectedModel = model();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new chat or model invalidates cached suggestions
  useEffect(() => {
    if (!(focused || input || busy)) later(conversation.suggest());
  }, [conversation, focused, input, busy, chat.id, turns.length, selectedModel]);
  const showSuggestions = !(focused || input || busy) && suggestions.length > 0;
  useEffect(() => {
    if (!arg || arg.n === chat.arg) return;
    chat.arg = arg.n;
    if (arg.send && !chat.state.busy) say(arg.text);
    else {
      type(arg.text);
      ref.current?.focus();
    }
  }, [arg, chat, say, type]);
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
        newChat();
        type('');
      }}
      busy={busy}
      composer={
        <Composer>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (input.trim() && !busy) say(input);
            }}
          >
            <Textarea
              ref={ref}
              aria-label="Message"
              placeholder={
                busy ? 'Working…' : showSuggestions ? suggestions[0] : 'Say what to file, or ask…'
              }
              value={input}
              disabled={busy}
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
            <ComposerActions>
              <DictateButton textareaRef={ref} onText={type} disabled={busy} />
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
                <Button type="submit" size="icon-lg" aria-label="Send" disabled={!input.trim()}>
                  <Icon name="arrow-up" />
                </Button>
              )}
            </ComposerActions>
          </form>
        </Composer>
      }
    >
      <ConversationFeed empty={!turns.length}>
        {!turns.length && (
          <ConversationWelcome
            title="What would you like to remember?"
            description="Tell the agent what to file, or ask what your vault knows."
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
        mobile={mobile}
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

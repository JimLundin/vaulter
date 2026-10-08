// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Button,
  Composer,
  ConversationFeed,
  ConversationSurface,
  Heading,
  Icon,
  Input,
  Json,
  Label,
  Link,
  Markdown,
  Message,
  Row,
  Stack,
  Text,
  Textarea,
  ToolResult,
  DictateButton,
} from '../../ui/kit/index.ts';
import { link } from '../../ui/routing.ts';
import { later } from '../../ui/later.ts';
import { renderBody } from './rendering/markdown.ts';
import { type Conversation, type Part, type Turn, useChat } from './conversation.ts';
import { MODEL_KEY, model } from './model.ts';

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
  const { turns, busy } = useChat(conversation);
  const [input, setInput] = useState(chat.draft);
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
      type('');
      later(send(text));
    },
    [type, send],
  );
  useEffect(viewing, [viewing]);
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
    return <Text tone="muted">The agent needs an OpenAI key and a writable vault.</Text>;
  return (
    <ConversationSurface>
      <Row justify="between">
        {historyHref ? (
          <Link href={link(historyHref)}>History</Link>
        ) : (
          <Text size="sm" tone="subtle">
            Your conversation
          </Text>
        )}
        <Button variant="ghost" size="sm" disabled={busy} onClick={newChat}>
          <Icon name="plus" />
          New chat
        </Button>
      </Row>
      <ConversationFeed>
        {!turns.length && (
          <Stack gap="xl">
            <Heading level={1} serif={true}>
              What would you like to remember?
            </Heading>
            <Text tone="muted">
              Tell the agent what to file, ask what your vault knows, or say “sign-off”.
            </Text>
            <Row wrap={true}>
              {['vault it: ', "What's due this week?", 'sign-off'].map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (suggestion === 'vault it: ') {
                      type(suggestion);
                      ref.current?.focus();
                    } else say(suggestion);
                  }}
                >
                  {suggestion}
                </Button>
              ))}
            </Row>
          </Stack>
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
      <Composer>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (input.trim() && !busy) say(input);
          }}
        >
          <Stack gap="sm">
            <Textarea
              ref={ref}
              aria-label="Message"
              placeholder={busy ? 'Working…' : 'Say what to file, or ask…'}
              value={input}
              disabled={busy}
              onChange={(event) => type(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <Row justify="between">
              <Model />
              <Row>
                <DictateButton textareaRef={ref} onText={type} disabled={busy} />
                {busy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label="Stop"
                    onClick={stop}
                  >
                    <Icon name="stop" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={!input.trim()}>
                    <Icon name="sparkles" />
                    Send
                  </Button>
                )}
              </Row>
            </Row>
          </Stack>
        </form>
      </Composer>
    </ConversationSurface>
  );
}
function Model() {
  const id = useId();
  const [value, setValue] = useState(model);
  return (
    <Stack gap="xs">
      <Label htmlFor={id}>
        <Text as="span" size="xs" tone="subtle">
          Model
        </Text>
      </Label>
      <Input
        id={id}
        aria-label="Model"
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          localStorage.setItem(MODEL_KEY, event.currentTarget.value);
        }}
      />
    </Stack>
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

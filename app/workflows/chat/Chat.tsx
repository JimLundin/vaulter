// Chat behaviour composes the public kit; presentation and styling stay in the kit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CodeDiff,
  Composer,
  ConversationFeed,
  ConversationSurface,
  ConversationWelcome,
  PromptSuggestions,
  VoiceStatus,
  Json,
  Link,
  Markdown,
  Message,
  Overlay,
  Row,
  Stack,
  Text,
  LiveStatus,
  ToolGroup,
  ToolResult,
} from '../../ui/kit/index.ts';
import { liveLabel, running, segments, summarize, type ToolPart } from './activity.ts';
import { link } from '../../ui/routing.ts';
import { later } from '../../ui/later.ts';
import { renderBody } from './rendering/markdown.ts';
import type { Part, Turn } from './view.ts';
import type { NodeConversation } from './node-conversation.ts';
import { useNodeChat } from './use-node-conversation.ts';
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
  conversation: NodeConversation;
  arg: Prompt | null;
  historyHref?: string;
  voice: Transcription;
}) {
  const { newChat, send, stop, viewing } = conversation;
  const {
    draft: input,
    turns,
    suggestions,
    busy,
    persistenceError,
    persistenceStage,
    phase,
  } = useNodeChat(conversation);
  const [retrying, setRetrying] = useState(false);
  const argSeen = useRef(0);
  const [focused, setFocused] = useState(false);
  const transcript = useTranscript(voice);
  const recording = ['connecting', 'listening', 'finishing'].includes(transcript.phase);
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
  }, [
    conversation,
    focused,
    input,
    busy,
    conversation.conversation(),
    turns.length,
    selectedModel,
    recording,
  ]);
  const showSuggestions = !(focused || input || busy || recording) && suggestions.length > 0;
  useEffect(() => {
    if (!arg || arg.n === argSeen.current) return;
    argSeen.current = arg.n;
    if (arg.send && !conversation.snapshot().busy) say(arg.text);
    else {
      type(arg.text);
      requestAnimationFrame(() => ref.current?.focus());
    }
  }, [arg, conversation, say, type]);
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
  if (!(conversation.ready() || turns.length || persistenceError))
    return (
      <ConversationSurface
        historyHref={historyHref ? link(historyHref) : undefined}
        onNewChat={newChat}
        busy={false}
        composer={null}
      >
        <ConversationFeed>
          <Text tone="muted">{conversation.availability() ?? 'Opening the node store…'}</Text>
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
      status={
        <Stack>
          <VoiceStatus phase={transcript.phase} error={transcript.error} />
          {!!conversation.availability() && (
            <Text role="status" tone="subtle">
              {conversation.availability()}
            </Text>
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
          onDraftChange={(text) => {
            voice.clear();
            type(text);
          }}
          onSubmit={(text) => {
            if (text.trim() && !(busy || recording)) say(text);
          }}
          label="Message"
          placeholder={busy ? 'Working…' : recording ? 'Start speaking…' : 'Type a message…'}
          canSubmit={conversation.ready() && !(recording || persistenceError)}
          busy={busy}
          readOnly={recording}
          voice={{ phase: transcript.phase, onClick: voiceAction }}
          onStop={stop}
          fieldRef={ref}
          onFocusChange={setFocused}
        />
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
                voice.clear();
                later(send(pending.text));
              }}
            >
              Send and keep staged edits
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
/** One call as its own row; two or more folded into a single summary line. */
function Tools({ parts }: { parts: ToolPart[] }) {
  if (parts.length === 1) return <Tool part={parts[0]} />;
  return (
    <ToolGroup
      summary={summarize(parts)}
      count={parts.length}
      running={!!running(parts)}
      error={parts.some((p) => p.error)}
    >
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: calls only append
        <Tool key={i} part={part} />
      ))}
    </ToolGroup>
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
  const tools = turn.parts.filter((p): p is ToolPart => p.kind === 'tool');
  const now = live ? running(tools) : undefined;
  return (
    <Stack>
      {segments(turn.parts).map((segment, i) =>
        segment.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments only append
          <Said key={i} text={segment.part.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments only append
          <Stack key={i}>
            <Tools parts={segment.parts} />
            {segment.parts.map(
              (part) =>
                !!part.commit &&
                !!historyHref && (
                  <Link key={part.commit} href={link(historyHref)}>
                    {part.result}
                  </Link>
                ),
            )}
          </Stack>
        ),
      )}
      {live && !!now && <LiveStatus>{liveLabel(now)}</LiveStatus>}
      {live && !turn.parts.length && <LiveStatus>Thinking…</LiveStatus>}
      {turn.status === 'unknown' && (
        <Text role="status" tone="subtle">
          Recorded Agent run; outcome unknown. Opening history does not resume execution.
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

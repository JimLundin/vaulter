// The agent's chat (app/agent.ts): Jim talks, it reads, stages and commits, following meta/conventions.md.
// It fills whatever holds it (the docked panel, a sheet, a phone's drawer, the /agent/ page): the
// conversation takes the height, the composer stays at the bottom. The conversation itself is chat.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PlusIcon, SquareIcon } from 'lucide-react';
import type { PanelArg } from '../../core/extension.ts';
import { titleOf } from '../notes/model/fields.ts';
import { useHost } from '../../core/host.tsx';
import { link, useRoute } from '../../core/route.ts';
import { renderBody } from '../reader/markdown.ts';
import { later } from '../../core/later.ts';
import { chat, MODEL_KEY, model, newChat, ready, send, stop, useChat, viewing } from './chat.ts';
import type { Part, Turn } from './chat.ts';
import { Button } from '@/components/ui/button.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation.tsx';
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSpeechButton,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input.tsx';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool.tsx';
import { historyPage } from './routes.ts';
import { graphOf } from '../graph/model/graph.ts';

const dictates = 'SpeechRecognition' in globalThis || 'webkitSpeechRecognition' in globalThis;
const VAULT_IT = 'vault it: ';

export function AgentChat({ arg }: { arg: PanelArg | null; close?: () => void }) {
  const host = useHost();
  chat.host = host;
  const { turns, busy } = useChat();
  const { path } = useRoute();
  const note = graphOf(host.files).byHref.get(path);
  const [input, setInput] = useState(chat.draft);
  const ref = useRef<HTMLTextAreaElement>(null);
  const type = useCallback((t: string) => {
    chat.draft = t;
    setInput(t);
  }, []);
  const focus = () =>
    requestAnimationFrame(() => {
      const t = ref.current;
      t?.focus();
      t?.setSelectionRange(t.value.length, t.value.length);
    });
  const say = (text: string) => {
    type('');
    later(send(text));
  };

  useEffect(viewing, []);
  // Opened with a prompt (⌘K's "Ask the agent: …"): sent, or put in to finish; each opening once.
  // biome-ignore lint/correctness/useExhaustiveDependencies: per opening (arg.n), whatever else changed
  useEffect(() => {
    if (!arg || arg.n === chat.arg) return;
    chat.arg = arg.n;
    if (arg.send && !chat.state.busy) say(arg.text);
    else {
      type(arg.text);
      focus();
    }
  }, [arg]);

  if (!ready(host))
    return (
      <p className="p-6 text-muted-foreground text-sm">
        {!host.secrets?.openai
          ? host.secrets
            ? 'No OpenAI key is sealed: set the VAULT_OPENAI_KEY repo secret and run the publish workflow.'
            : 'The agent runs in the published app, with the sealed OpenAI key; in dev there is none.'
          : "Committing isn't available here."}
      </p>
    );

  const suggestions: { label: string; run: () => void }[] = [
    {
      label: 'vault it: …',
      run: () => {
        type(VAULT_IT);
        focus();
      },
    },
    { label: "What's due this week?", run: () => say("What's due this week?") },
    { label: 'sign-off', run: () => say('sign-off') },
    ...(note
      ? [
          {
            label: `What do I know about ${titleOf(note)}?`,
            run: () => say(`What do I know about ${titleOf(note)}?`),
          },
        ]
      : []),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {turns.length > 0 && (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3 text-xs">
          <a href={link(historyPage.href())} className="text-muted-foreground">
            History
          </a>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1 text-xs max-md:h-9"
            disabled={busy}
            onClick={newChat}
          >
            <PlusIcon />
            New chat
          </Button>
        </div>
      )}
      <Conversation className="min-h-0">
        <ConversationContent className="gap-6">
          {turns.length === 0 && (
            <div className="grid gap-4 pt-2">
              <p className="text-muted-foreground text-sm">
                Tell it what to file, ask what the vault knows, or say "sign-off". It follows
                meta/conventions.md and commits on its own; everything it commits is in{' '}
                <a href={link(historyPage.href())}>History</a>, with a revert.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <Button
                    key={s.label}
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-full whitespace-normal rounded-full py-1.5 text-left font-normal max-md:min-h-11 max-md:px-4 max-md:text-base"
                    onClick={s.run}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === 'user' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: turns only append; a turn is its place in the conversation
              <UserTurn key={i} turn={t} />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: turns only append; a turn is its place in the conversation
              <AgentTurn key={i} turn={t} live={busy && i === turns.length - 1} />
            ),
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 p-3 pt-0">
        <PromptInput
          onSubmit={() => {
            if (input.trim()) say(input);
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              ref={ref}
              value={input}
              placeholder={busy ? 'Working…' : 'Say what to file, or ask…'}
              disabled={busy}
              className="max-md:text-base"
              onChange={(e) => type(e.currentTarget.value)}
              // ⌘/Ctrl+Enter sends; Enter is a new line (notes are often several).
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools className="min-w-0">
              <Model />
              <span className="truncate text-faint text-xs max-md:hidden">⌘/Ctrl+Enter sends</span>
            </PromptInputTools>
            <div className="flex items-center gap-1">
              {!!dictates && (
                <PromptInputSpeechButton
                  textareaRef={ref}
                  onTranscriptionChange={type}
                  disabled={busy}
                  aria-label="Dictate"
                  className="max-md:size-10"
                />
              )}
              {busy ? (
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  aria-label="Stop"
                  className="max-md:size-10"
                  onClick={stop}
                >
                  <SquareIcon />
                </Button>
              ) : (
                <PromptInputSubmit
                  aria-label="Send"
                  className="max-md:size-10"
                  disabled={!input.trim()}
                />
              )}
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

/** Which model answers, kept per device. */
function Model() {
  const [value, setValue] = useState(model);
  return (
    <Label className="gap-1.5 font-normal text-faint text-xs">
      Model
      <Input
        className="h-7 w-32 font-mono text-foreground text-xs"
        value={value}
        onChange={(e) => {
          setValue(e.currentTarget.value);
          localStorage.setItem(MODEL_KEY, e.currentTarget.value);
        }}
      />
    </Label>
  );
}

/** What Jim said, as typed. */
function UserTurn({ turn }: { turn: Turn }) {
  return (
    <div className="ml-auto max-w-[85%] rounded-lg bg-secondary px-4 py-2.5 whitespace-pre-wrap">
      {turn.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')}
    </div>
  );
}

/** The agent's text as vault Markdown: links resolve, and it reads like a note. */
function Said({ text }: { text: string }) {
  const body = useMemo(() => renderBody({ id: 'agent', path: 'agent.md', body: text }), [text]);
  return <div className="prose">{body}</div>;
}

const toolState = (p: Part & { kind: 'tool' }) =>
  p.error ? 'output-error' : p.result === undefined ? 'input-available' : 'output-available';

function AgentTurn({ turn, live }: { turn: Turn; live: boolean }) {
  return (
    <div className="grid min-w-0 gap-3">
      {turn.parts.map((p, j) =>
        p.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts only append; a part is its place in the turn
          <Said key={j} text={p.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts only append; a part is its place in the turn
          <Tool key={j} className="mb-0">
            <ToolHeader
              type={`tool-${p.name}`}
              title={p.input ? `${p.name} · ${p.input}` : p.name}
              state={toolState(p)}
            />
            <ToolContent>
              <ToolInput input={p.args} />
              {p.result !== undefined && (
                <ToolOutput
                  output={
                    p.commit ? (
                      <p className="p-3">
                        <a href={link(historyPage.href())}>{p.result}</a>
                      </p>
                    ) : (
                      p.output
                    )
                  }
                  errorText={p.error ? p.result : undefined}
                />
              )}
            </ToolContent>
          </Tool>
        ),
      )}
      {live && turn.parts.length === 0 && (
        <p className="flex items-center gap-2 text-faint text-sm" aria-live="polite">
          <span className="size-1.5 animate-pulse rounded-full bg-faint" />
          Thinking…
        </p>
      )}
      {!!turn.error && <p className="text-destructive text-sm">{turn.error}</p>}
      {!!(turn.model || turn.tokens) && (
        <p className="text-faint text-xs tabular-nums">
          {[
            turn.model,
            turn.tokens &&
              `${turn.tokens.in.toLocaleString()} in · ${turn.tokens.out.toLocaleString()} out`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </div>
  );
}

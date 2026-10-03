// The agent (app/agent.ts): Jim talks, it reads, stages and commits, following meta/conventions.md.
// The model and the SDK load with this view. The conversation lives in memory for the session, outside
// the view, so it survives moving around the app and a running turn keeps going meanwhile.
import { useEffect, useMemo, useState } from 'react';
import { SquareIcon } from 'lucide-react';
import type { ModelMessage, ToolSet } from 'ai';
import type { AgentContext } from '../../core/extension.ts';
import { search } from '../../../core/search.ts';
import { agentWriter, type Writer } from '../../core/writer.ts';
import { useHost } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { renderBody } from '../../core/markdown.ts';
import { later } from '../../core/later.ts';
import { appVersion, collect, type Place } from './meta.ts';
import { recordExchange, type ChatTurn, type Collected } from './record.ts';
import { Empty, PageHeader } from '@/components/layout.tsx';
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

const MODEL_KEY = 'vault.agent.model';
const DEFAULT_MODEL = 'gpt-6-astra';

type Part =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool';
      name: string;
      /** The call in a line (brief), and in full. */
      input: string;
      args?: unknown;
      output?: unknown;
      result?: string;
      error?: boolean;
      commit?: string;
    };
interface Turn {
  role: 'user' | 'agent';
  parts: Part[];
  error?: string;
  /** When it started, for the raw record; and, for the agent's, what it cost and who answered. */
  at: string;
  tokens?: { in: number; out: number };
  model?: string;
}

const chat = {
  /** This chat, in its exchanges' session: a random id per chat. */
  id: crypto.randomUUID().slice(0, 8),
  turns: [] as Turn[],
  /** Turns before this one are in a capture already. */
  captured: 0,
  /** What the device says about the current turn, collected while the agent works. */
  meta: null as Promise<Collected> | null,
  history: [] as ModelMessage[],
  busy: false as boolean,
  abort: null as AbortController | null,
  host: null as ReturnType<typeof useHost> | null,
  listeners: new Set<() => void>(),
  emit() {
    for (const f of this.listeners) f();
  },
};

/** The tool call in a line: its path or query, not the whole file. */
const brief = (name: string, input: any) =>
  input?.path ??
  input?.query ??
  input?.message ??
  (name === 'check' ? '' : JSON.stringify(input ?? {}).slice(0, 80));

/** A turn as the raw record takes it: what was said, and which tools the agent used. */
const chatTurn = (t: Turn): ChatTurn => ({
  role: t.role,
  at: t.at,
  text: t.parts
    .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    .join('')
    .trim(),
  tools: t.parts.flatMap((p) => (p.kind === 'tool' ? [p.name] : [])),
  tokens: t.tokens,
  model: t.model,
});

/** The vault's place notes with coordinates, to match a location fix against. */
const placesOf = (host: ReturnType<typeof useHost>): Place[] =>
  host.vault.notes.flatMap((n) => {
    const g = n.data.geo;
    return n.data.type === 'place' && typeof g?.lat === 'number' && typeof g?.lon === 'number'
      ? [{ id: n.id, lat: g.lat, lon: g.lon }]
      : [];
  });

export function Agent() {
  const host = useHost();
  const { secrets, writer: w } = host;
  chat.host = host;
  const [, rerender] = useState(0);
  useEffect(() => {
    const f = () => rerender((n) => n + 1);
    chat.listeners.add(f);
    return () => {
      chat.listeners.delete(f);
    };
  }, []);
  const [input, setInput] = useState('');
  const [model, setModel] = useState(() => localStorage.getItem(MODEL_KEY) || DEFAULT_MODEL);
  const { turns, busy } = chat;

  if (!secrets?.openai)
    return (
      <PageHeader
        title="Agent"
        lede={
          secrets
            ? 'No OpenAI key is sealed: set the VAULT_OPENAI_KEY repo secret and run the publish workflow.'
            : 'The agent runs in the published app, with the sealed OpenAI key; in dev there is none.'
        }
      />
    );
  if (!w.commit) return <PageHeader title="Agent" lede="Committing isn't available here." />;

  // The latest writer and search, also after this view is gone: the tools run between renders.
  const aw = agentWriter(() => chat.host!.writer as Writer);
  const ctx = {
    w: aw,
    search: (q: string) => search(chat.host!.index, q),
    since: host.since,
    secrets,
    capture: async (judged: Parameters<NonNullable<AgentContext['capture']>>[0]) => {
      const r = recordExchange({
        turns: chat.turns.slice(chat.captured).map(chatTurn),
        judged,
        collected: (await chat.meta) ?? { groups: {} },
        session: { chat: chat.id, model, app: appVersion() },
        files: aw.files(),
      });
      await aw.stage(r.path, r.text);
      chat.captured = chat.turns.length;
      return { path: r.path, at: r.exchange.at, raw: r.raw };
    },
  };
  const tools = async (): Promise<ToolSet> =>
    Object.assign(
      {},
      ...(await Promise.all(chat.host!.extensions.map((e) => e.tools?.(ctx) ?? {}))),
    );

  const send = async () => {
    const text = input.trim();
    if (!text || chat.busy) return;
    setInput('');
    const now = new Date().toISOString();
    const agentTurn: Turn = { role: 'agent', parts: [], at: now };
    chat.busy = true;
    chat.turns = [
      ...chat.turns,
      { role: 'user', parts: [{ kind: 'text', text }], at: now },
      agentTurn,
    ];
    chat.meta = collect(placesOf(host)).catch(() => ({ groups: {} }));
    const update = () => {
      chat.turns = [...chat.turns];
      chat.emit();
    };
    update();
    chat.history = [...chat.history, { role: 'user', content: text }];
    chat.abort = new AbortController();
    try {
      const [{ runAgent }, { createOpenAI }] = await Promise.all([
        import('./tools.ts'),
        import('@ai-sdk/openai'),
      ]);
      const openai = createOpenAI({
        apiKey: secrets.openai,
        baseURL: import.meta.env.VITE_OPENAI_API || undefined,
      });
      const run = runAgent(openai(model), ctx, chat.history, await tools(), chat.abort.signal);
      const calls = new Map<string, Part & { kind: 'tool' }>();
      for await (const p of run.stream) {
        if (p.type === 'text-delta') {
          const last = agentTurn.parts.at(-1);
          if (last?.kind === 'text') last.text += p.text;
          else agentTurn.parts.push({ kind: 'text', text: p.text });
        } else if (p.type === 'tool-call') {
          const part: Part & { kind: 'tool' } = {
            kind: 'tool',
            name: p.toolName,
            input: brief(p.toolName, p.input),
            args: p.input,
          };
          calls.set(p.toolCallId, part);
          agentTurn.parts.push(part);
        } else if (p.type === 'tool-result' || p.type === 'tool-error') {
          const part = calls.get(p.toolCallId);
          if (part) {
            const out: any = p.type === 'tool-result' ? p.output : { error: String(p.error) };
            part.output = out;
            part.error = !!out?.error;
            part.commit = out?.committed;
            part.result = out?.error
              ? out.error + (out.problems ? `: ${out.problems.join('; ')}` : '')
              : out?.committed
                ? `committed ${out.committed}`
                : out?.problems
                  ? out.problems.length
                    ? `${out.problems.length} problems`
                    : 'check passes'
                  : out?.staged
                    ? `staged: ${out.staged.join(', ')}`
                    : 'ok';
          }
        } else if (p.type === 'finish-step') {
          const t = agentTurn.tokens ?? { in: 0, out: 0 };
          agentTurn.tokens = {
            in: t.in + (p.usage.inputTokens ?? 0),
            out: t.out + (p.usage.outputTokens ?? 0),
          };
          agentTurn.model = p.response.modelId || agentTurn.model;
        } else if (p.type === 'error') {
          agentTurn.error = String((p.error as any)?.message ?? p.error);
        }
        update();
      }
      chat.history = await run.done;
    } catch (e) {
      agentTurn.error = (e as Error).name === 'AbortError' ? 'Stopped.' : (e as Error).message;
      update();
    } finally {
      chat.busy = false;
      chat.abort = null;
      chat.emit();
    }
  };

  return (
    <div className="v-agent">
      <PageHeader
        title="Agent"
        lede={
          <>
            Tell it what to file ("vault it: …"), ask what the vault knows, or say "sign-off". It
            follows meta/conventions.md and commits on its own; everything it commits is in{' '}
            <a href={link('/history/')}>History</a>, with a revert.
          </>
        }
      />
      <Conversation className="h-[calc(100dvh-24rem)] min-h-80 rounded-xl border bg-background">
        <ConversationContent className="gap-6">
          {turns.length === 0 && <Empty>Nothing said yet.</Empty>}
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
      <PromptInput
        className="mt-3"
        onSubmit={() => {
          later(send());
        }}
      >
        <PromptInputBody>
          <PromptInputTextarea
            value={input}
            placeholder="vault it: …"
            disabled={busy}
            onChange={(e) => setInput(e.currentTarget.value)}
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
          <PromptInputTools>
            <Label className="gap-2 font-normal text-faint text-xs">
              Model
              <Input
                className="h-7 w-36 font-mono text-foreground text-xs"
                value={model}
                onChange={(e) => setModel(e.currentTarget.value)}
                onBlur={(e) => localStorage.setItem(MODEL_KEY, e.currentTarget.value)}
              />
            </Label>
            <span className="text-faint text-xs max-sm:hidden">⌘/Ctrl+Enter sends</span>
          </PromptInputTools>
          {busy ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              onClick={() => chat.abort?.abort()}
            >
              <SquareIcon />
            </Button>
          ) : (
            <PromptInputSubmit disabled={!input.trim()} />
          )}
        </PromptInputFooter>
      </PromptInput>
    </div>
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
  const body = useMemo(
    () => renderBody({ id: 'agent', path: 'agent.md', ext: 'md', body: text }),
    [text],
  );
  return <div className="prose">{body}</div>;
}

const toolState = (p: Part & { kind: 'tool' }) =>
  p.error ? 'output-error' : p.result === undefined ? 'input-available' : 'output-available';

function AgentTurn({ turn, live }: { turn: Turn; live: boolean }) {
  return (
    <div className="grid gap-3">
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
                        <a href={link('/history/')}>{p.result}</a>
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

// The agent (app/agent.ts): Jim talks, it reads, stages and commits, following meta/conventions.md.
// The model and the SDK load with this view. The conversation lives in memory for the session, outside
// the view, so it survives moving around the app and a running turn keeps going meanwhile.
import { useEffect, useState } from 'preact/hooks';
import type { ModelMessage, ToolSet } from 'ai';
import { search } from '../../../core/search.ts';
import { agentWriter, type Writer } from '../../core/writer.ts';
import { useHost } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './agent.css';
import { later } from '../../core/later.ts';

const MODEL_KEY = 'vault.agent.model';
const DEFAULT_MODEL = 'gpt-6-astra';

type Part =
  | { kind: 'text'; text: string }
  | {
      kind: 'tool';
      name: string;
      input: string;
      result?: string;
      error?: boolean;
      commit?: string;
    };
interface Turn {
  role: 'user' | 'agent';
  parts: Part[];
  error?: string;
}

const chat = {
  turns: [] as Turn[],
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
      <div class="v-agent">
        <h1>Agent</h1>
        <p class="lede">
          {secrets
            ? 'No OpenAI key is sealed: set the VAULT_OPENAI_KEY repo secret and run the publish workflow.'
            : 'The agent runs in the published app, with the sealed OpenAI key; in dev there is none.'}
        </p>
      </div>
    );
  if (!w.commit)
    return (
      <div class="v-agent">
        <h1>Agent</h1>
        <p class="lede">Committing isn't available here.</p>
      </div>
    );

  // The latest writer and search, also after this view is gone: the tools run between renders.
  const ctx = {
    w: agentWriter(() => chat.host!.writer as Writer),
    search: (q: string) => search(chat.host!.index, q),
    since: host.since,
    secrets,
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
    const agentTurn: Turn = { role: 'agent', parts: [] };
    chat.busy = true;
    chat.turns = [...chat.turns, { role: 'user', parts: [{ kind: 'text', text }] }, agentTurn];
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
          };
          calls.set(p.toolCallId, part);
          agentTurn.parts.push(part);
        } else if (p.type === 'tool-result' || p.type === 'tool-error') {
          const part = calls.get(p.toolCallId);
          if (part) {
            const out: any = p.type === 'tool-result' ? p.output : { error: String(p.error) };
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
    <div class="v-agent">
      <h1>Agent</h1>
      <div class="turns">
        {turns.length === 0 && (
          <p class="lede">
            Tell it what to file ("vault it: …"), ask what the vault knows, or say "sign-off". It
            follows meta/conventions.md and commits on its own; everything it commits is in{' '}
            <a href={link('/history/')}>History</a>, with a revert.
          </p>
        )}
        {turns.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: turns only append; a turn is its place in the conversation
          <div key={i} class={`turn ${t.role}`}>
            {t.parts.map((p, j) =>
              p.kind === 'text' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts only append; a part is its place in the turn
                <div key={j} class="text">
                  {p.text}
                </div>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: parts only append; a part is its place in the turn
                <div key={j} class={`tool${p.error ? ' err' : ''}`}>
                  <b>{p.name}</b>
                  {!!p.input && (
                    <>
                      {' '}
                      <code>{p.input}</code>
                    </>
                  )}
                  {!!p.result && (
                    <span>
                      {' '}
                      → {p.commit ? <a href={link('/history/')}>{p.result}</a> : p.result}
                    </span>
                  )}
                </div>
              ),
            )}
            {!!t.error && <p class="app-error">{t.error}</p>}
          </div>
        ))}
      </div>
      <form
        class="ask"
        onSubmit={(e) => {
          e.preventDefault();
          later(send());
        }}
      >
        <textarea
          value={input}
          rows={3}
          placeholder="vault it: …"
          disabled={busy}
          onInput={(e) => setInput(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              later(send());
            }
          }}
        />
        <div class="bar">
          {busy ? (
            <button type="button" onClick={() => chat.abort?.abort()}>
              Stop
            </button>
          ) : (
            <button type="submit" class="primary" disabled={!input.trim()}>
              Send
            </button>
          )}
          <label>
            Model{' '}
            <input
              value={model}
              onChange={(e) => {
                setModel(e.currentTarget.value);
                localStorage.setItem(MODEL_KEY, e.currentTarget.value);
              }}
            />
          </label>
          <span class="hint">⌘/Ctrl+Enter sends</span>
        </div>
      </form>
    </div>
  );
}

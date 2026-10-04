// The agent in the app (PLAN-browser-app.md, phase 6): a model with tools over the vault, following
// meta/conventions.md, which it reads from the vault itself. It stages edits and commits them on its
// own; the commit tool is the app's commit (write.ts), so a failing check comes back as the tool result
// for the model to fix, and nothing broken reaches main.
import {
  streamText,
  tool,
  isStepCount,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
import { z } from 'zod';
import { vaultOf } from '../../../core/derive.ts';
import { isVaultPath } from '../../../core/vault.ts';
import { titleOf, kind } from '../../../core/note-fields.ts';
import { schemaOf } from '../../../core/schema.ts';
import { capturePath } from '../../../core/capture.ts';
import { today } from '../../../core/format.ts';
import { CheckFailed, Conflict } from '../../core/backend.ts';
import { newProblems } from '../../core/writer.ts';
import type { AgentContext } from '../../core/extension.ts';

const LIST_MAX = 200;

export function agentTools({ w, search, capture }: AgentContext) {
  const vault = () => vaultOf(w.files());
  const byPath = (path: string) => w.files().find((f) => f.path === path);
  return {
    search: tool({
      description:
        'Find notes and topics by title, alias, tag or summary. Use before creating a note, to find the one that exists.',
      inputSchema: z.object({ query: z.string() }),
      execute: ({ query }) =>
        search(query).map((h) => ({
          href: h.entry.href,
          title: h.entry.t,
          kind: h.entry.k,
          summary: h.entry.e,
          why: h.why,
        })),
    }),
    listNotes: tool({
      description:
        'List notes, optionally of one type (person, place, project, …), with a tag, or of one kind (note, daily, capture, meta).',
      inputSchema: z.object({
        type: z.string().optional(),
        tag: z.string().optional(),
        kind: z.enum(['note', 'daily', 'capture', 'meta']).optional(),
      }),
      execute: ({ type, tag, kind: k }) =>
        vault()
          .notes.filter(
            (n) =>
              (!k || kind(n.id) === k) &&
              (!type || n.data.type === type) &&
              (!tag || (n.data.tags ?? []).includes(tag)),
          )
          .slice(0, LIST_MAX)
          .map((n) => ({ path: n.path, title: titleOf(n), summary: String(n.data.summary ?? '') })),
    }),
    readFile: tool({
      description:
        'Read a file of the vault as text, frontmatter included, with any staged edits. Paths: "Ada.md", "daily/2026-10-03.md", "captures/…", "meta/conventions.md", "meta/schema.yaml" (the vocabulary).',
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) => byPath(path)?.text ?? { error: `no such file: ${path}` },
    }),
    backlinks: tool({
      description: 'The notes linking to a note, with the line that links.',
      inputSchema: z.object({ path: z.string() }),
      execute: ({ path }) => {
        const v = vault();
        const n = v.byId.get(path.replace(/\.mdx?$/, ''));
        return n
          ? (v.backlinks.get(n.id) ?? []).map((b) => ({ path: b.from.path, context: b.context }))
          : { error: `no such note: ${path}` };
      },
    }),
    writeFile: tool({
      description:
        "Stage a whole file's new text (create or replace). Nothing reaches the vault until commit.",
      inputSchema: z.object({ path: z.string(), text: z.string() }),
      execute: async ({ path, text }) => {
        if (!isVaultPath(path))
          return {
            error: `${path} isn't a vault file: notes at the root (.md, .mdx), daily/, captures/, meta/ (.md), meta/schema.yaml`,
          };
        await w.stage(path, text);
        return { staged: w.staged() };
      },
    }),
    deleteFile: tool({
      description: 'Stage deleting a file.',
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        if (!byPath(path)) return { error: `no such file: ${path}` };
        await w.stage(path, null);
        return { staged: w.staged() };
      },
    }),
    check: tool({
      description:
        "Run the vault's check over the staged edits: the problems they add (empty means the commit will pass).",
      inputSchema: z.object({}),
      execute: async () => ({
        staged: w.staged(),
        problems: await newProblems(w.base(), w.files()),
      }),
    }),
    commit: tool({
      description:
        'Commit everything staged to main as one commit, with this message (conventions §12). Refused if the check fails.',
      inputSchema: z.object({ message: z.string() }),
      execute: async ({ message }) => {
        if (!w.commit) return { error: 'committing is not available here (dev: use git)' };
        if (!w.staged().length) return { error: 'nothing is staged' };
        try {
          const sha = await w.commit(message);
          // A commit sha shortened; a backend's own id (the folder's "folder-…") whole.
          return { committed: /^[0-9a-f]{8,}$/i.test(sha) ? sha.slice(0, 7) : sha };
        } catch (e) {
          if (e instanceof CheckFailed)
            return { error: 'the check fails; fix these and commit again', problems: e.problems };
          if (e instanceof Conflict)
            return {
              error: `changed on main meanwhile: ${e.paths.join(', ')}; read them again, redo the edit, commit again`,
            };
          return { error: (e as Error).message };
        }
      },
    }),
    ...(capture && { capture: captureTool(w, capture) }),
  } satisfies ToolSet;
}

/** The raw record (conventions §8a), written by the app from the chat itself. */
function captureTool(w: AgentContext['w'], capture: NonNullable<AgentContext['capture']>) {
  let procedures = 'capture, sign-off, …';
  try {
    procedures = schemaOf(w.files())
      .procedures.map((p) => p.key)
      .join(', ');
  } catch {
    // no schema: the check will say so at commit
  }
  return tool({
    description: `Stage the raw record of this Capture (conventions §8a): the app appends everything said since the last capture, verbatim, to today's log (captures/YYYY-MM-DD.md) as one exchange, with what it collects itself (time, device, place, weather, session). You give only what needs judgement: the procedure (${procedures}), a one-line summary, the topics (the notes it was filed into) and any place Jim named. Once per Capture, as its raw-record step, before the daily bullet: it returns "raw", the link that bullet ends with ("Raw: …"). Then file the curated side and commit it all as one commit. Never write the log with writeFile.`,
    inputSchema: z.object({
      procedure: z.string(),
      summary: z.string(),
      topics: z.array(z.string()),
      where: z.array(z.string()).optional(),
    }),
    execute: async (judged) => {
      try {
        return { ...(await capture(judged)), staged: w.staged() };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  });
}

const TODAY_MAX = 30_000;

/** Where Jim is in the app as he speaks: a note (its title and path) or a page. */
export interface OnScreen {
  title: string;
  path?: string;
}

/** The agent's instructions: the app's plumbing and what Jim is looking at, then the vault's own rules,
 * which win, then today's log so far (the one conversation, from any device), so a chat picks up where
 * the last one left off. */
export function instructions(conventions: string, now = new Date(), log = '', page?: OnScreen) {
  return `You are Jim's vault agent, inside his vault app. The vault is a git repo of Markdown notes; this app reads it, and your tools read, stage and commit files in it.

Every rule about the vault (note format, filing, procedures, questions, git) is in meta/conventions.md, below, and it is authoritative. Follow it exactly. Where it says to run a command or use git, use your tools instead:
- "Start from latest main" / "pull": the app is already on the latest main; just read.
- Reading and searching: search, listNotes, readFile, backlinks.
- Writing: writeFile (whole files) and deleteFile stage edits; nothing changes until commit.
- The audit (tools/audit.ts): the audit tool.
- The check (tools/check.ts): the check tool. "Commit and push": the commit tool, once per Capture, with the message the conventions give. If the commit tool reports problems or a conflict, fix them and commit again.

What Jim says maps to a procedure in the conventions: "vault it", "file this", "capture this", "remember this" → Capture; "sign-off" → Sign-off; "sweep the vault" → Weekly Sweep; "what do I know about …", "check the vault", "when did …", "pull up what we have on …", "resolve the open questions" → Recall. If no procedure matches, say so and stop rather than improvising one. Writing reads the conventions (below) in full first; never write unless Jim asked for a Capture or his answers turn into one.

The raw record of a Capture (captures/) is this conversation, and the capture tool writes it: verbatim, from the chat itself, with the time, device, place and weather the app collects. Today's log so far is at the end: the same conversation, earlier today, on this device or another; pick up from it rather than asking again. Today is ${now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' })} (${now.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Europe/Stockholm' })}), Europe/Stockholm.${
    page
      ? `

Jim is looking at: ${page.path ? `${page.title} (${page.path})` : `the ${page.title} page`}; "this" or "here" means it.`
      : ''
  }

=== meta/conventions.md ===
${conventions}${
  log
    ? `

=== Today so far (${capturePath(today())}) ===
${log.length > TODAY_MAX ? `…${log.slice(-TODAY_MAX)}` : log}`
    : ''
}`;
}

/** One turn: the history plus Jim's message; `done` resolves to the history to keep for the next turn.
 * `tools`: what the other extensions add to the vault tools; `page`: what Jim is looking at. */
export function runAgent(
  model: LanguageModel,
  ctx: AgentContext,
  history: ModelMessage[],
  tools: ToolSet = {},
  signal?: AbortSignal,
  page?: OnScreen,
) {
  const conventions =
    ctx.w.files().find((f) => f.path === 'meta/conventions.md')?.text ??
    '(meta/conventions.md is missing: say so and stop)';
  const log = ctx.w.files().find((f) => f.path === capturePath(today()))?.text ?? '';
  const r = streamText({
    model,
    instructions: instructions(conventions, new Date(), log, page),
    messages: history,
    tools: { ...tools, ...agentTools(ctx) },
    stopWhen: isStepCount(40),
    abortSignal: signal,
  });
  return {
    stream: r.fullStream,
    done: Promise.resolve(r.responseMessages).then((m) => [...history, ...m]),
  };
}

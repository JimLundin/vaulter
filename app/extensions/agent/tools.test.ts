import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryBackend } from '../../backends/memory.ts';
import { agentWriter, writerCore, type Writer } from '../../core/writer.ts';
import { search, searchIndex } from '../../../core/search.ts';
import { vaultOf } from '../../../core/derive.ts';
import { SCHEMA } from '../../../core/schema.fixture.ts';
import { notes } from '../notes/index.tsx';
import { editor } from '../editor/index.tsx';
import { runAgent } from './tools.ts';
import { recordExchange } from './record.ts';
import { checkVault } from '../../../core/check.ts';
import { capturePath } from '../../../core/capture.ts';
import { today } from '../../../core/format.ts';
import { code } from '../code/index.tsx';
import { codeRepo } from '../code/repo.ts';
import { codeTools } from '../code/tools.ts';
import { fakeGitHub } from '../../backends/github/fake-github.ts';
import { github } from '../../backends/github/api.ts';
import type { AgentContext } from '../../core/extension.ts';

const NOTE = (title: string, extra = '') =>
  `---\ntype: topic\naliases: []\ntags: [area/craft, programming]\ncreated: 2026-10-03\nsummary: "${title}."\n---\n# ${title}\n\n${extra}\n\n## See also\n`;
const VAULT = {
  ...SCHEMA,
  'Home.md':
    '---\ntype: moc\naliases: []\ntags: []\ncreated: 2026-01-01\nsummary: "Home."\n---\n# Home\n',
  'Alpha.md': NOTE('Alpha'),
  'meta/conventions.md': '# Conventions\n\nCAPTURE RULES GO HERE.\n',
};

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const toolStep = (...calls: [string, unknown][]) => ({
  stream: convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    ...calls.map(([toolName, input], i) => ({
      type: 'tool-call' as const,
      toolCallId: `${toolName}-${i}-${Math.random()}`,
      toolName,
      input: JSON.stringify(input),
    })),
    {
      type: 'finish' as const,
      finishReason: { unified: 'tool-calls' as const, raw: undefined },
      usage,
    },
  ]),
});
const textStep = (text: string) => ({
  stream: convertArrayToReadableStream([
    { type: 'stream-start' as const, warnings: [] },
    { type: 'text-start' as const, id: 't' },
    { type: 'text-delta' as const, id: 't', delta: text },
    { type: 'text-end' as const, id: 't' },
    { type: 'finish' as const, finishReason: { unified: 'stop' as const, raw: undefined }, usage },
  ]),
});

/** The app's writer over an in-memory vault, as the agent sees it. */
async function writer(extra: Record<string, string> = {}) {
  const m = memoryBackend({ ...VAULT, ...extra });
  let head = (await m.backend.refresh())!;
  const core = writerCore(
    m.backend,
    () => head.files,
    (h) => {
      head = h;
    },
  );
  const w = (): Writer => ({
    base: head.files,
    overlay: core.overlay,
    stage: core.stage,
    unstage: core.unstage,
    discard: core.discard,
    commit: core.commit,
    revert: core.revert,
    history: m.backend.history,
    patch: m.backend.patch,
    current: () => ({ base: head.files, overlay: core.overlay }),
  });
  const aw = agentWriter(w);
  const ctx: AgentContext = {
    w: aw,
    search: (q) => search(searchIndex(notes.search!(vaultOf(aw.files()))), q),
  };
  return { ...m, ctx };
}

test('the agent stages, is refused by the check, fixes it, and commits once', async () => {
  const { ctx, backend, files } = await writer();
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep(
        ['search', { query: 'Gamma' }],
        ['writeFile', { path: 'Gamma.md', text: NOTE('Gamma', 'See [Nobody](</Nobody.md>).') }],
      ),
      toolStep(['commit', { message: 'vaulter: Gamma' }]),
      toolStep(
        ['writeFile', { path: 'Gamma.md', text: NOTE('Gamma', 'See [Alpha](</Alpha.md>).') }],
        ['check', {}],
      ),
      toolStep(['commit', { message: 'vaulter: Gamma' }]),
      textStep('Filed Gamma, linked to Alpha.'),
    ],
  });

  const run = runAgent(model, ctx, [{ role: 'user', content: 'vault it: Gamma relates to Alpha' }]);
  const seen: string[] = [];
  for await (const p of run.stream) {
    if (p.type === 'tool-result') seen.push(`${p.toolName}: ${JSON.stringify(p.output)}`);
    if (p.type === 'text-delta') seen.push(`text: ${p.text}`);
  }
  const history = await run.done;

  // The first commit was refused with the check's problem; the second went through, once.
  expect(seen.find((s) => s.startsWith('commit:'))).toMatch(/the check fails.*Nobody\.md/);
  expect(seen.filter((s) => s.startsWith('commit:'))[1]).toMatch(/committed/);
  expect(seen.find((s) => s.startsWith('check:'))).toContain('"problems":[]');
  expect(await backend.history!()).toHaveLength(1);
  expect(files().find((f) => f.path === 'Gamma.md')?.text).toContain('See [Alpha]');
  expect(seen.at(-1)).toBe('text: Filed Gamma, linked to Alpha.');
  // It was told the vault's own rules, and the history carries the whole turn for the next one.
  const first = JSON.stringify(model.doStreamCalls[0].prompt);
  expect(first).toContain('=== meta/conventions.md ===');
  expect(first).toContain('CAPTURE RULES GO HERE.');
  expect(history.length).toBeGreaterThan(4);
});

test('writeFile refuses a path outside the vault', async () => {
  const { ctx } = await writer();
  const model = new MockLanguageModelV4({
    doStream: [toolStep(['writeFile', { path: 'site/app/evil.ts', text: 'x' }]), textStep('ok')],
  });
  const run = runAgent(model, ctx, [{ role: 'user', content: 'x' }]);
  let out = '';
  for await (const p of run.stream) if (p.type === 'tool-result') out = JSON.stringify(p.output);
  await run.done;
  expect(out).toMatch(/isn't a vault file/);
  expect(ctx.w.staged()).toEqual([]);
});

test('renameNote, from the editor, stages the move and the links that follow it', async () => {
  const { ctx } = await writer({
    'Beta.md': NOTE('Beta', 'See [Alpha](</Alpha.md#see-also>).').replace(
      '---\n# Beta',
      'relations:\n  related-to: [Alpha]\n---\n# Beta',
    ),
  });
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep(['renameNote', { from: 'Alpha.md', to: 'Home.md' }]),
      toolStep(['renameNote', { from: 'Alpha.md', to: 'Alpha Centauri.md' }]),
      toolStep(['check', {}]),
      textStep('Renamed.'),
    ],
  });
  const run = runAgent(
    model,
    ctx,
    [{ role: 'user', content: 'rename Alpha to Alpha Centauri' }],
    await editor.tools!(ctx),
  );
  const out: string[] = [];
  for await (const p of run.stream)
    if (p.type === 'tool-result') out.push(JSON.stringify(p.output));
  await run.done;
  expect(out[0]).toMatch(/Home.md exists/);
  expect(ctx.w.staged().sort((a, b) => a.localeCompare(b))).toEqual([
    'Alpha Centauri.md',
    'Alpha.md',
    'Beta.md',
  ]);
  const beta = ctx.w.files().find((f) => f.path === 'Beta.md')!.text;
  expect(beta).toContain('[Alpha](</Alpha Centauri.md#see-also>)');
  expect(beta).toContain('related-to: [Alpha Centauri]');
  expect(out[2]).toContain('"problems":[]');
});

test("the agent changes the app's own source: reads it, stages, and commits once to its main", async () => {
  const { ctx } = await writer();
  const app = { owner: 'JimLundin', name: 'vaulter', branch: 'main' };
  const f = await fakeGitHub({ 'app/extensions/index.ts': 'export const EXTENSIONS = [];\n' });
  const repo = codeRepo(github('tok', app, 'https://gh.test', f.fetchFn), app, 'https://gh.test');
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep(['listCode', { prefix: 'app/' }], ['readCode', { path: 'app/extensions/index.ts' }]),
      toolStep(
        [
          'writeCode',
          { path: 'app/extensions/reading/index.tsx', text: 'export const reading = {};\n' },
        ],
        [
          'writeCode',
          { path: 'app/extensions/index.ts', text: 'export const EXTENSIONS = [reading];\n' },
        ],
      ),
      toolStep(['commitCode', { message: 'a reading list' }]),
      textStep('Added the reading list; it deploys once the tests pass.'),
    ],
  });
  const run = runAgent(
    model,
    ctx,
    [{ role: 'user', content: 'add a reading list' }],
    codeTools('tok', repo),
  );
  const seen: string[] = [];
  for await (const p of run.stream)
    if (p.type === 'tool-result') seen.push(`${p.toolName}: ${JSON.stringify(p.output)}`);
  await run.done;
  expect(seen[0]).toBe('listCode: {"files":["app/extensions/index.ts"]}');
  expect(seen.find((s) => s.startsWith('commitCode:'))).toContain(f.state.main);
  expect(f.filesAt()).toEqual({
    'app/extensions/index.ts': 'export const EXTENSIONS = [reading];\n',
    'app/extensions/reading/index.tsx': 'export const reading = {};\n',
  });
  // The vault was not touched.
  expect(ctx.w.staged()).toEqual([]);
});

test('the code tools come only with a GitHub token', async () => {
  const { ctx } = await writer();
  expect(await code.tools!(ctx)).toEqual({});
  expect(Object.keys(await code.tools!({ ...ctx, secrets: { github: 'tok' } }))).toEqual([
    'listCode',
    'readCode',
    'searchCode',
    'writeCode',
    'deleteCode',
    'commitCode',
    'codeStatus',
  ]);
});

test("a Capture's raw record is the chat itself, staged with the edits, and the next chat sees it", async () => {
  const { ctx, files } = await writer();
  const said = 'vault it: Gamma, uh,   relates to Alpha.';
  const capturing = {
    ...ctx,
    capture: async (judged: Parameters<NonNullable<typeof ctx.capture>>[0]) => {
      const r = recordExchange({
        turns: [{ role: 'user', at: new Date().toISOString(), text: said }],
        judged,
        collected: { groups: { device: { id: '3f9c', form: 'phone' } } },
        session: { chat: 'c1' },
        files: ctx.w.files(),
      });
      await ctx.w.stage(r.path, r.text);
      return { path: r.path, at: r.exchange.at, raw: r.raw };
    },
  };
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep([
        'writeFile',
        { path: 'Gamma.md', text: NOTE('Gamma', 'See [Alpha](</Alpha.md>).') },
      ]),
      toolStep([
        'capture',
        { procedure: 'capture', summary: 'Gamma relates to Alpha.', topics: ['Gamma'] },
      ]),
      toolStep(['commit', { message: 'vaulter: Gamma' }]),
      textStep('Filed Gamma.'),
    ],
  });
  const run = runAgent(model, capturing, [{ role: 'user', content: said }]);
  const seen: string[] = [];
  for await (const p of run.stream)
    if (p.type === 'tool-result') seen.push(`${p.toolName}: ${JSON.stringify(p.output)}`);
  await run.done;
  expect(seen.find((s) => s.startsWith('commit:'))).toMatch(/committed/);
  const log = files().find((f) => f.path === capturePath(today()))!.text;
  expect(log).toContain(`**Jim:** ${said}`);
  expect(log).toContain('device: {id: 3f9c, form: phone}');
  expect(checkVault(files()).problems).toEqual([]);

  // A new chat, on any device, starts from today's log.
  const next = new MockLanguageModelV4({ doStream: [textStep('Picking up.')] });
  const again = runAgent(next, capturing, [{ role: 'user', content: 'where were we?' }]);
  for await (const _ of again.stream);
  await again.done;
  const prompt = JSON.stringify(next.doStreamCalls[0].prompt);
  expect(prompt).toContain(`=== Today so far (${capturePath(today())}) ===`);
  expect(prompt).toContain('Gamma, uh,   relates to Alpha.');
});

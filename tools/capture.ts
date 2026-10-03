// The raw record of a Capture from a shell session (Claude Code, the Claude app's sandbox, a scheduled task):
// appends one exchange to the day's log (core/capture.ts, meta/conventions.md §8a). The session gives what
// needs judgement and the transcript (stdin, its turns marked **Jim:** and **Agent:**); this collects the rest
// on its own: the time, the machine (its host is the device for Claude Code; the Claude app's sandbox isn't
// Jim's device, so only `host`), the session, the vault's git state, and the weather at a place note named.
// Never an environment variable that holds a secret.
//
// Usage, from the vault root:
//   node ../vaulter/tools/capture.ts --source claude-code --procedure capture --summary "One line." \
//     --topic "Note" [--topic …] [--where "Place"] [--at 2026-10-03T08:12:40+02:00] [--vault <dir>] < turns.md
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { arch, hostname, platform, release, userInfo } from 'node:os';
import { join } from 'node:path';
import {
  appendExchange,
  capturePath,
  dayOfStamp,
  lastRawLink,
  stockholmStamp,
  type Turn,
} from '../core/capture.ts';
import { loadNotes } from '../core/vault.ts';
import { weather } from '../core/weather.ts';
import { readVaultFiles, vaultArg } from './fs.ts';

const fail = (m: string): never => {
  console.error(m);
  process.exit(2);
};
const args = process.argv.slice(2);
const all = (flag: string) =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const one = (flag: string) => all(flag).at(-1);

const source =
  one('--source') ?? fail('--source is required (claude-code, claude-app, scheduled, …)');
const procedure = one('--procedure') ?? fail('--procedure is required (capture, sign-off, …)');
const summary =
  one('--summary') ?? fail('--summary is required: one line on what the exchange was');
const topics = all('--topic');
const named = all('--where');

/** The transcript: turns that start with **Jim:** or **Agent:**, verbatim. */
export function parseTurns(input: string): Turn[] {
  return [
    ...input.matchAll(
      /^\*\*(Jim|Agent):\*\*[ \t]?([\s\S]*?)(?=^\*\*(?:Jim|Agent):\*\*|(?![\s\S]))/gm,
    ),
  ].map((m) => ({ who: m[1] as Turn['who'], text: m[2].trim() }));
}
const turns = parseTurns(readFileSync(0, 'utf8'));
// A scheduled task's report is one **Agent:** turn (conventions §0); anything else records what Jim said.
if (!turns.length) fail('stdin has no **Jim:** or **Agent:** turn: pipe in the transcript');
if (source !== 'scheduled' && !turns.some((t) => t.who === 'Jim'))
  fail('stdin has no **Jim:** turn: pipe in the transcript');

const ROOT = vaultArg();
const files = readVaultFiles(ROOT);
const sh = (cmd: string, a: string[]) => {
  try {
    return execFileSync(cmd, a, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
};

const wsl = /microsoft/i.test(release());
const machine = {
  host: hostname(),
  os: wsl
    ? 'Windows (WSL)'
    : ({ linux: 'Linux', darwin: 'macOS', win32: 'Windows' }[platform() as string] ?? platform()),
  kernel: release(),
  arch: arch(),
  user: userInfo().username,
  shell: process.env.SHELL?.split('/').at(-1),
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  locale: process.env.LANG?.split('.')[0],
  node: process.versions.node,
};
const { env } = process;
const session = {
  claude_session: env.CLAUDE_CODE_SESSION_ID,
  entrypoint: env.CLAUDE_CODE_ENTRYPOINT,
  effort: env.CLAUDE_EFFORT,
  model: env.ANTHROPIC_MODEL ?? env.CLAUDE_MODEL,
  task: env.SCHEDULED_TASK ?? env.CLAUDE_SCHEDULED_TASK,
  vault_head: sh('git', ['rev-parse', '--short', 'HEAD']),
  vault_branch: sh('git', ['branch', '--show-current']),
  turns: turns.length,
};

// The weather at the first place note named that has coordinates.
const [geo] = loadNotes(files)
  .filter((n) => named.includes(n.id) && typeof n.data.geo?.lat === 'number')
  .map((n) => n.data.geo as { lat: number; lon: number });
const sky = geo ? await weather(geo.lat, geo.lon, (...a) => fetch(...a), 5000) : undefined;

const at = one('--at') ?? stockholmStamp();
const path = capturePath(dayOfStamp(at));
let before: string | null = null;
try {
  before = readFileSync(join(ROOT, path), 'utf8');
} catch {
  before = null;
}
const text = appendExchange(
  before,
  {
    at,
    ended: stockholmStamp(),
    source,
    procedure,
    summary,
    topics,
    ...(named.length ? { where: named } : {}),
    // Claude Code runs on Jim's machine, so the machine is the device; elsewhere it is only the host.
    ...(source === 'claude-code'
      ? { device: { form: 'computer', ...machine } }
      : { host: machine }),
    session,
    ...(sky ? { weather: { ...sky, at: named[0] } } : {}),
  },
  turns,
);
mkdirSync(join(ROOT, 'captures'), { recursive: true });
writeFileSync(join(ROOT, path), text);
console.log(`appended an exchange at ${at.slice(11, 16)} to ${path}`);
console.log(`raw link for the daily bullet: Raw: ${lastRawLink(text, dayOfStamp(at))}`);

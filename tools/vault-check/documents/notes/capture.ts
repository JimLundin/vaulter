// The raw record (meta/conventions.md §8a): one log per Stockholm day, `captures/YYYY-MM-DD.md`, of the one
// conversation Jim has with the vault wherever he is. Each exchange is a heading and its verbatim turns in the
// body, appended at the end and never edited; everything known about it is in the frontmatter, under
// `exchanges`, in the same order: what the agent judged (procedure, summary, topics, where) and what the
// surface collected on its own (device, context, location, weather, session, host, …). Pure: the app, the
// check and tools/capture.ts share it.
import { dump, load } from 'js-yaml';
import { FRONT_RE, type Frontmatter } from './note.ts';

export const CAPTURE_RE = /^captures\/(\d{4}-\d{2}-\d{2})\.md$/;
export const capturePath = (day: string) => `captures/${day}.md`;

/** "2026-10-03T08:12:40+02:00": a time with its offset, as the exchange's `at` and `ended`. */
export const STAMP_RE =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface Turn {
  who: 'Jim' | 'Agent';
  text: string;
}

/** One exchange's frontmatter. The judged fields are required; the collected groups are whatever the
 * surface could read (maps of plain values), so a new kind of metadata needs no change here. */
export interface Exchange {
  at: string;
  ended?: string;
  source: string;
  procedure: string;
  summary: string;
  topics: string[];
  where?: string[];
  [group: string]: unknown;
}

/** `date` in Stockholm as a stamp with its offset: "2026-10-03T08:12:40+02:00". */
export function stockholmStamp(date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Stockholm',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** The day a stamp is on, in its own offset (the vault's are Stockholm's). */
export const dayOfStamp = (at: string) => at.slice(0, 10);

/** The headings of exchanges at these times, in order: "HH:MM", or "HH:MM:SS" when the minute is taken. */
export function headingsFor(ats: string[]): string[] {
  const seen = new Set<string>();
  return ats.map((at) => {
    const m = STAMP_RE.exec(at);
    const hm = m ? `${m[2]}:${m[3]}` : at;
    const h = seen.has(hm) && m ? `${hm}:${m[4]}` : hm;
    seen.add(h);
    return h;
  });
}
/** The anchor a heading gets ("08:12" → "0812"), for daily notes' raw links. */
export const anchorOf = (heading: string) => heading.replace(/:/g, '');

/** The daily bullet's raw link to the last exchange in a day's log (conventions §7):
 * "[captures/2026-10-03#0812](</captures/2026-10-03.md#0812>)". */
export function lastRawLink(text: string, day: string) {
  const h = bodyHeadings(text.replace(FRONT_RE, '')).at(-1);
  if (!h) throw new Error(`${capturePath(day)} has no exchange`);
  const a = anchorOf(h);
  return `[captures/${day}#${a}](</${capturePath(day)}#${a}>)`;
}

/** The exchange headings in a log's body, in order. */
export const bodyHeadings = (body: string) =>
  [...body.matchAll(/^## (\d{2}:\d{2}(?::\d{2})?)\s*$/gm)].map((m) => m[1]);

const renderTurns = (turns: Turn[]) =>
  turns.map((t) => `**${t.who}:** ${t.text.trim()}`).join('\n\n');

/** The log's frontmatter (type, date, exchanges), or null when it has none or it isn't YAML. */
export function logData(text: string): Frontmatter | null {
  const m = FRONT_RE.exec(text);
  if (!m) return null;
  try {
    const d = load(m[1]);
    return d && typeof d === 'object' ? (d as Frontmatter) : null;
  } catch {
    return null;
  }
}

/** Drop what wasn't collected (undefined, null, empty groups), so the frontmatter holds only what is known. */
function compact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(compact);
  if (v && typeof v === 'object') {
    const out = Object.entries(v)
      .map(([k, x]) => [k, compact(x)] as const)
      .filter(([, x]) => x !== undefined && x !== null && !(isMap(x) && !Object.keys(x).length));
    return Object.fromEntries(out);
  }
  return v;
}
const isMap = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);

const frontmatter = (day: string, exchanges: Exchange[]) =>
  `---\n${dump(
    { type: 'capture', date: day, exchanges: exchanges.map(compact) },
    { lineWidth: 100, noRefs: true, flowLevel: 3, quotingType: '"' },
  )}---\n`;

/**
 * A day's log with one more exchange at the end: `text` is the log so far, or null for the day's first. The
 * body before it is kept byte for byte; the frontmatter is rewritten with the new exchange added.
 */
export function appendExchange(text: string | null, ex: Exchange, turns: Turn[]): string {
  const day = dayOfStamp(ex.at);
  const data = text ? logData(text) : null;
  if (text && !data) throw new Error(`${capturePath(day)}: its frontmatter can't be read`);
  const before: Exchange[] = Array.isArray(data?.exchanges) ? data.exchanges : [];
  const last = before.at(-1)?.at;
  if (last && Date.parse(String(last)) > Date.parse(ex.at))
    throw new Error(`an exchange at ${ex.at} would come before ${last}`);
  const all = [...before, ex];
  const heading = headingsFor(all.map((e) => String(e.at))).at(-1)!;
  const body = text ? text.replace(FRONT_RE, '').replace(/^\n+/, '').trimEnd() : '';
  const entry = `## ${heading}\n\n${renderTurns(turns)}`;
  return `${frontmatter(day, all)}\n${body ? `${body}\n\n` : ''}${entry}\n`;
}

/** What a day's exchanges add up to: for views and the audit, never stored. */
export function dayTotals(exchanges: Exchange[]) {
  const uniq = (xs: unknown[]) => [
    ...new Set(xs.filter((x): x is string => typeof x === 'string')),
  ];
  return {
    sources: uniq(exchanges.map((e) => e.source)),
    devices: uniq(
      exchanges.map((e) => (isMap(e.device) ? (e.device.id ?? e.device.host) : undefined)),
    ),
    procedures: uniq(exchanges.map((e) => e.procedure)),
    topics: uniq(exchanges.flatMap((e) => e.topics ?? [])),
    where: uniq(exchanges.flatMap((e) => e.where ?? [])),
  };
}

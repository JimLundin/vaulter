// The vault's captures as conversations: each capture entry is an exchange of its turns, placed in
// the conversation of its recorded session or capture file, with its references, its source and
// procedure, and what the capture tool collected as observations.
import type { JsonObject, JsonValue } from '../../app/vault/nodes/model.ts';
import { hash } from './keys.ts';
import { FENCE_RE, frontOf } from './pages.ts';
import { asObject, type Data, list, type Specs } from './records.ts';
import { report, tally } from './report.ts';

const TIMEZONE = 'Europe/Stockholm';
const HEADING_RE = /^## (\d{2}:\d{2}(?::\d{2})?)\s*$/;
const MARKERS: RegExp[] = [
  /^\*\*(Jim|Agent):\*\* ?/,
  /^\*\*(Jim|Agent) \(([^)]*)\):\*\* ?/,
  /^\*\*(Jim|Agent)\*\* \(([^)]*)\): ?/,
];
const STAMP_RE = /^(?:(\d{4}-\d{2}-\d{2}) )?(\d{2}:\d{2})(?:[–-]\d{2}:\d{2})?(?:, .*)?$/;

/** Lines, marking those inside fenced code. */
function* lines(body: string) {
  let fence: string | null = null;
  for (const line of body.split('\n')) {
    const f = FENCE_RE.exec(line);
    const inside = fence !== null || !!f;
    if (f) {
      const marker = f[1]![0]!;
      fence = fence === null ? marker : fence === marker ? null : fence;
    }
    yield { line, code: inside };
  }
}
interface Turn {
  role: 'user' | 'agent';
  stamp: { date: string | null; time: string } | null;
  text: string;
}
function turnsOf(text: string) {
  const turns: Turn[] = [];
  const preamble: string[] = [];
  for (const { line, code } of lines(text)) {
    const m = code ? null : MARKERS.map((re) => re.exec(line)).find(Boolean);
    if (m) {
      const s = m[2] ? STAMP_RE.exec(m[2]) : null;
      turns.push({
        role: m[1] === 'Jim' ? 'user' : 'agent',
        stamp: s ? { date: s[1] ?? null, time: s[2]! } : null,
        text: line.slice(m[0].length),
      });
    } else if (turns.length) turns.at(-1)!.text += `\n${line}`;
    else preamble.push(line);
  }
  for (const t of turns) t.text = t.text.replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
  return { turns, preamble: preamble.join('\n').trim() || null };
}
/** A wall-clock minute in Stockholm as an instant with its offset. */
export function stockholm(date: string, time: string) {
  const offset = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    timeZoneName: 'longOffset',
  })
    .formatToParts(new Date(Date.parse(`${date}T${time}:00Z`) - 3600e3))
    .find((p) => p.type === 'timeZoneName')!.value;
  return `${date}T${time}:00${offset.replace('GMT', '') || '+00:00'}`;
}
const offsetMinutes = (at: string) => {
  const m = /([+-])(\d{2}):(\d{2})$/.exec(at);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
};

/** Which conversation an exchange belongs to: its recorded session, the capture file it was one
 * conversation of, or itself. */
function conversationOf(entry: JsonObject, anchor: string, topicFile: string | null) {
  const session = asObject(entry.session).claude_session;
  if (session) return `conversation:session:${String(session)}`;
  return topicFile ? `conversation:file:${topicFile}` : `conversation:exchange:${anchor}`;
}
/** A conversation's title: an imported transcript's own heading, else the lead of its summary. */
function titleOf(preamble: string | null, summary: JsonValue | undefined, day: string) {
  const heading = preamble ? /^#\s+(.+)$/m.exec(preamble)?.[1]?.trim() : undefined;
  if (heading) return heading.slice(0, 200);
  const text: string = typeof summary === 'string' ? summary.trim() : '';
  const lead = /^([^:;.]{3,60})[:;.]/.exec(text)?.[1];
  if (lead) return `${lead} — ${day}`;
  if (text) return text.length > 80 ? `${text.slice(0, 80).replace(/\s+\S*$/, '')}…` : text;
  return `Conversation — ${day}`;
}
const pick = (values: JsonObject, keys: readonly string[]): JsonObject =>
  Object.fromEntries(
    keys
      .filter((k) => values[k] !== undefined && values[k] !== null && values[k] !== '')
      .map((k) => [k, values[k]!]),
  );

/** A weather reading waiting for its place's coordinates, which the replay supplies. */
export const PENDING_WEATHER = 'pendingWeather';

/** Each old per-topic capture file's entry in the day log it was consolidated into. */
export type Consolidated = ReadonlyMap<string, { anchor: string; entry: JsonObject }>;
export function consolidatedEntries(logs: readonly [path: string, text: string][]): Consolidated {
  const out = new Map<string, { anchor: string; entry: JsonObject }>();
  for (const [path, text] of logs) {
    const { data, body } = frontOf(text);
    const headings = [...body.matchAll(/^## (\d{2}:\d{2}(?::\d{2})?)\s*$/gm)].map((m) => m[1]!);
    list(data.exchanges).forEach((value, i) => {
      const entry = asObject(value);
      const { from } = asObject(entry.migrated);
      const heading = headings[i];
      if (typeof from === 'string' && heading)
        out.set(from, { anchor: `${path}#${heading.replace(/:/g, '')}`, entry });
    });
  }
  return out;
}

export interface CaptureProjection {
  specs: Specs;
  /** Each conversation's earliest exchange here, which titles it. */
  titles: Map<string, { startedAt: string; title: string }>;
}
/** One capture file's exchanges and everything under them. */
export function projectCapture(
  path: string,
  text: string,
  consolidated: Consolidated,
): CaptureProjection {
  const specs: Specs = new Map();
  const titles = new Map<string, { startedAt: string; title: string }>();
  const { data, body } = frontOf(text);
  const day = /(\d{4}-\d{2}-\d{2})/.exec(path)![1]!;
  let sections: {
    heading: string | null;
    text: string;
    entry: JsonObject;
    anchor: string;
    precision: string;
    topicFile: string | null;
  }[];
  const { exchanges } = data;
  if (Array.isArray(exchanges)) {
    const parts: { heading: string; lines: string[] }[] = [];
    for (const { line, code } of lines(body)) {
      const h = code ? null : HEADING_RE.exec(line);
      if (h) parts.push({ heading: h[1]!, lines: [] });
      else parts.at(-1)?.lines.push(line);
    }
    sections = parts.map((part, i) => {
      const entry = asObject(exchanges[i]);
      const { from } = asObject(entry.migrated);
      return {
        heading: part.heading,
        text: part.lines.join('\n'),
        entry,
        anchor: `${path}#${part.heading.replace(/:/g, '')}`,
        precision: entry.migrated ? 'approximate' : 'second',
        topicFile: typeof from === 'string' ? from : null,
      };
    });
  } else {
    const later = consolidated.get(path);
    sections = [
      {
        heading: null,
        text: body,
        entry: { ...data, at: later?.entry.at ?? stockholm(day, '00:00') },
        anchor: later?.anchor ?? path,
        precision: later ? 'approximate' : 'day',
        topicFile: path,
      },
    ];
  }
  for (const s of sections) {
    const ex = `exchange:${s.anchor}`;
    const startedAt = String(s.entry.at);
    const {
      at: _at,
      ended,
      procedure,
      summary,
      topics,
      where,
      source,
      migrated: _migrated,
      type: _type,
      date: _date,
      title: _title,
      ...collected
    } = s.entry;
    const { turns, preamble } = turnsOf(s.text);
    const conversation = conversationOf(s.entry, s.anchor, s.topicFile);
    const earliest = titles.get(conversation);
    if (!earliest || Date.parse(startedAt) < Date.parse(earliest.startedAt))
      titles.set(conversation, { startedAt, title: titleOf(preamble, summary, day) });
    specs.set(ex, {
      parent: conversation,
      order: `e${new Date(startedAt).toISOString().replace(/[-:.]/g, '')}${hash(s.anchor)}`,
      data: {
        kind: 'exchange',
        startedAt,
        startedAtPrecision: s.precision,
        ...(ended ? { endedAt: String(ended) } : {}),
        time: { timezone: TIMEZONE, offsetMinutes: offsetMinutes(startedAt) },
        ...(summary ? { summary: String(summary) } : {}),
        ...(preamble ? { preamble } : {}),
      },
    });
    let current = {
      at: startedAt,
      date: day,
      precision: s.precision === 'second' ? 'approximate' : s.precision,
    };
    turns.forEach((turn, n) => {
      if (turn.stamp) {
        const date = turn.stamp.date ?? current.date;
        current = { at: stockholm(date, turn.stamp.time), date, precision: 'minute' };
      }
      const precision = turn.stamp
        ? 'minute'
        : current.precision === 'minute'
          ? 'approximate'
          : current.precision;
      const message: Data =
        turn.role === 'user'
          ? {
              kind: 'message',
              role: 'user',
              at: current.at,
              atPrecision: precision,
              text: turn.text,
              input: { methods: ['imported'] },
            }
          : {
              kind: 'message',
              role: 'agent',
              at: current.at,
              atPrecision: precision,
              status: 'complete',
              parts: [{ kind: 'text', text: turn.text }],
            };
      specs.set(`${ex}#${n + 1}`, {
        parent: ex,
        order: `m${String(n + 1).padStart(4, '0')}`,
        data: message,
      });
    });
    const references = [
      ...list(topics).map((t): [string, JsonValue] => ['topic', t]),
      ...list(where).map((w): [string, JsonValue] => ['place', w]),
    ];
    references.forEach(([role, name], n) => {
      specs.set(`${ex}/${role}/${n}`, {
        parent: ex,
        order: `r${role[0]}${String(n).padStart(4, '0')}`,
        data: { kind: 'reference', role, label: String(name) },
        target: { page: String(name) },
      });
    });
    if (source)
      specs.set(`${ex}/source`, {
        parent: ex,
        order: 's1',
        data: { kind: 'relationship', predicate: 'source', label: String(source) },
        target: { term: `source:${String(source)}` },
      });
    if (procedure)
      specs.set(`${ex}/procedure`, {
        parent: ex,
        order: 's2',
        data: { kind: 'relationship', predicate: 'procedure', label: String(procedure) },
        target: { term: `procedure:${String(procedure)}` },
      });
    const observation = (subject: string, value: JsonObject): Data => ({
      kind: 'observation',
      subject,
      source: { kind: 'application', name: 'vault capture' },
      time: { requested: null, observed: startedAt, received: null, elapsedMs: null },
      outcome: { status: 'collected', value },
    });
    for (const [group, raw] of Object.entries(collected)) {
      const values = asObject(raw);
      const key = `${ex}/observation/${group}`;
      if (group === 'host')
        specs.set(key, {
          parent: ex,
          order: `o${group}`,
          data: observation('host', {
            ...pick(values, ['host', 'os', 'kernel', 'arch', 'user', 'shell', 'node']),
            ...(values.tz ? { timezone: values.tz } : {}),
          }),
        });
      else if (group === 'session')
        specs.set(key, {
          parent: ex,
          order: `o${group}`,
          data: observation('session', {
            ...(values.claude_session ? { session: values.claude_session } : {}),
            ...pick(values, ['entrypoint', 'effort', 'turns']),
          }),
        });
      else if (group === 'weather')
        specs.set(key, {
          parent: ex,
          order: `o${group}`,
          data: { kind: PENDING_WEATHER, reading: values },
        });
      else if (group === 'status' && raw === 'curated')
        tally(report.unknownFields, 'capture.status=curated (every capture is curated)');
      else tally(report.unknownFields, `capture.${group}`);
    }
  }
  return { specs, titles };
}

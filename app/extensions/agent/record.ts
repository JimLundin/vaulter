// The raw record of a Capture from the app (meta/conventions.md §8a): the chat since the last capture,
// verbatim from what was said (the app has it; the model never retypes it), appended to the day's log as one
// exchange. The model gives what needs judgement (procedure, summary, topics, where it heard); the rest is
// collected: times, the session, and what meta.ts reads from the device.
import {
  appendExchange,
  capturePath,
  dayOfStamp,
  lastRawLink,
  stockholmStamp,
  type Exchange,
  type Turn,
} from '../notes/model/capture.ts';
import type { VaultFile } from '../../core/files.ts';

/** A turn of the chat as the record needs it. */
export interface ChatTurn {
  role: 'user' | 'agent';
  /** When it started (an ISO instant). */
  at: string;
  text: string;
  tools?: string[];
  tokens?: { in: number; out: number };
  /** The model that answered, as the provider named it. */
  model?: string;
}

export interface Judged {
  procedure: string;
  summary: string;
  topics: string[];
  where?: string[];
}

/** What a surface collected on its own: groups of plain values, and the places it placed Jim at. */
export interface Collected {
  groups: Record<string, Record<string, unknown> | undefined>;
  where?: string[];
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** The exchange for these turns and the day's log with it appended. Throws when there is nothing to record. */
export function recordExchange(o: {
  turns: ChatTurn[];
  judged: Judged;
  collected: Collected;
  session: Record<string, unknown>;
  files: VaultFile[];
  now?: Date;
}): { path: string; text: string; exchange: Exchange; raw: string } {
  const said = o.turns.filter((t) => t.text.trim());
  if (!said.some((t) => t.role === 'user'))
    throw new Error('nothing Jim said since the last capture');
  const at = stockholmStamp(new Date(said[0].at));
  const path = capturePath(dayOfStamp(at));
  const tokens = o.turns.reduce(
    (s, t) => ({ in: s.in + (t.tokens?.in ?? 0), out: s.out + (t.tokens?.out ?? 0) }),
    { in: 0, out: 0 },
  );
  const where = uniq([...(o.collected.where ?? []), ...(o.judged.where ?? [])]);
  const exchange: Exchange = {
    at,
    ended: stockholmStamp(o.now),
    source: 'vault-app',
    procedure: o.judged.procedure,
    summary: o.judged.summary.trim(),
    topics: uniq(o.judged.topics),
    ...(where.length ? { where } : {}),
    ...o.collected.groups,
    session: {
      ...o.session,
      turns: said.length,
      served_by: uniq(o.turns.flatMap((t) => (t.model ? [t.model] : []))).join(', ') || undefined,
      tools: uniq(o.turns.flatMap((t) => t.tools ?? [])),
      tokens: tokens.in || tokens.out ? tokens : undefined,
    },
  };
  const turns: Turn[] = said.map((t) => ({
    who: t.role === 'user' ? 'Jim' : 'Agent',
    text: t.text,
  }));
  const before = o.files.find((f) => f.path === path)?.text ?? null;
  const text = appendExchange(before, exchange, turns);
  return { path, text, exchange, raw: lastRawLink(text, dayOfStamp(at)) };
}

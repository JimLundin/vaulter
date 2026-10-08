// The vault's mechanical rules, enforced by `npm run check` (meta/conventions.md says what needs judgement;
// everything that can be checked is checked here instead). The vocabularies are the vault's own data, in
// meta/schema.yaml, read by schemaOf; what stays here is mechanics: the frontmatter fields and the rules.
import { load } from 'js-yaml';
import { dateStr } from './format.ts';
import { SCHEMA_PATH, type Frontmatter, type VaultFile } from './vault.ts';
import type { Predicate } from './relations.ts';
import { bodyHeadings, CAPTURE_RE, headingsFor, STAMP_RE } from './capture.ts';

export interface Term {
  key: string;
  label: string;
  use: string;
}
export interface Area extends Term {
  hub?: string;
}

/** The vault's vocabulary (meta/schema.yaml), each list in the file's order. */
export interface Schema {
  /** The vault's owner: a person note without a circle. */
  owner: string;
  /** Note types, in the order views group them; `label` names the group. */
  types: Term[];
  /** Exactly one per note, in display (and colour) order; `hub` is the note that heads one, if any. */
  areas: Area[];
  /** In sort order: what is happening first, what is finished last. */
  statuses: Term[];
  circles: Term[];
  /** Broad topics, grouped for reading; `broadTopics` is all of them. */
  broad: Record<string, string[]>;
  broadTopics: Set<string>;
  /** Relation predicates (core/relations.ts), in display order. */
  predicates: Record<string, Predicate>;
  /** MDX components notes may use (conventions §13): the app implements them, the vault allows them. */
  components: string[];
  /** Where a capture's exchange came from (vault-app, claude-app, …), and what it was (capture, sign-off, …). */
  sources: Term[];
  procedures: Term[];
  typeOf: Map<string, Term>;
  areaOf: Map<string, Area>;
  statusOf: Map<string, Term>;
  circleOf: Map<string, Term>;
  /** Sort rank of a status: the first status, none, then the rest in order. */
  statusRank: (s: string) => number;
}

const fail = (m: string): never => {
  throw new Error(`${SCHEMA_PATH}: ${m}`);
};
const map = (v: unknown, m: string): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : fail(m);
const text = (v: unknown, at: string) =>
  typeof v === 'string' && v.trim() ? v : fail(`${at} must be text`);
const names = (v: unknown, at: string, re: RegExp) =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && re.test(x))
    ? (v as string[])
    : fail(`${at} must be a list of ${re}`);
const only = (v: Record<string, any>, at: string, fields: string[]) => {
  for (const k of Object.keys(v))
    if (!fields.includes(k)) fail(`${at}: unknown field "${k}" (fields: ${fields.join(', ')})`);
};
const KEY = /^[a-z][a-z0-9-]*$/;
const TAG = /^[a-z0-9][a-z0-9-]*$/;
const COMPONENT = /^[A-Z][A-Za-z0-9]*$/;

/** A section of `key: {label, use, …}`, in the file's order. */
function section<T>(
  raw: Record<string, any>,
  name: string,
  fields: string[],
  entry: (v: Record<string, any>, at: string) => T,
) {
  return Object.entries(
    map(raw[name] ?? {}, `${name} must be a map of key → {${fields.join(', ')}}`),
  ).map(([key, x]) => {
    const at = `${name}.${key}`;
    const v = map(x, `${at} must be a map of ${fields.join(', ')}`);
    if (!KEY.test(key)) fail(`${at}: keys are lowercase-hyphenated`);
    only(v, at, fields);
    return { key, ...entry(v, at) };
  });
}
const term = (v: Record<string, any>, at: string) => ({
  label: text(v.label, `${at}.label`),
  use: v.use == null ? '' : text(v.use, `${at}.use`),
});
const keyed = <T extends Term>(t: T[]) => new Map(t.map((x) => [x.key, x]));

/** meta/schema.yaml's parsed contents -> the schema, or an error naming what is wrong. A missing section is empty. */
export function parseSchema(file: unknown): Schema {
  const raw = map(file, 'must be a map of owner, types, areas, …');
  only(raw, 'the file', [
    'owner',
    'types',
    'areas',
    'statuses',
    'circles',
    'broad',
    'predicates',
    'components',
    'sources',
    'procedures',
  ]);
  const types = section(raw, 'types', ['label', 'use'], term);
  const areas: Area[] = section(raw, 'areas', ['label', 'hub', 'use'], (v, at) => ({
    ...term(v, at),
    ...(v.hub != null && { hub: text(v.hub, `${at}.hub`) }),
  }));
  const statuses = section(raw, 'statuses', ['label', 'use'], term);
  const circles = section(raw, 'circles', ['label', 'use'], term);
  const sources = section(raw, 'sources', ['label', 'use'], term);
  const procedures = section(raw, 'procedures', ['label', 'use'], term);
  const predicates: Record<string, Predicate> = {};
  for (const { key, ...v } of section(
    raw,
    'predicates',
    ['label', 'inverse', 'symmetric', 'use'],
    (x) => x,
  )) {
    const at = `predicates.${key}`;
    if (v.symmetric != null && v.symmetric !== true) fail(`${at}.symmetric can only be true`);
    if ((v.inverse != null) === !!v.symmetric)
      fail(`${at} needs an inverse label or symmetric: true (not both)`);
    predicates[key] = {
      label: text(v.label, `${at}.label`),
      ...(v.symmetric ? { symmetric: true } : { inverse: text(v.inverse, `${at}.inverse`) }),
      use: text(v.use, `${at}.use`),
    };
  }
  const broad = Object.fromEntries(
    Object.entries(map(raw.broad ?? {}, 'broad must be a map of group → [topics]')).map(
      ([g, l]) => [g, names(l, `broad.${g}`, TAG)],
    ),
  );
  const statusIx = (s: string) => statuses.findIndex((x) => x.key === s);
  return {
    owner: raw.owner == null ? '' : text(raw.owner, 'owner'),
    types,
    areas,
    statuses,
    circles,
    broad,
    predicates,
    broadTopics: new Set(Object.values(broad).flat()),
    components: names(raw.components ?? [], 'components', COMPONENT),
    sources,
    procedures,
    typeOf: keyed(types),
    areaOf: keyed(areas),
    statusOf: keyed(statuses),
    circleOf: keyed(circles),
    statusRank: (s) => (s === '' ? 1 : statusIx(s) === 0 ? 0 : 1 + statusIx(s)),
  };
}

/** No vocabulary: what the app has before the vault loads. */
export const NO_SCHEMA = parseSchema({});

/** The vault's schema, from meta/schema.yaml among its files. Throws, naming the file, if it's missing or wrong. */
export function schemaOf(files: VaultFile[]): Schema {
  const f =
    files.find((x) => x.path === SCHEMA_PATH) ??
    fail("missing: the vault's vocabulary (types, areas, statuses, …) lives here");
  let raw: unknown;
  try {
    raw = load(f.text);
  } catch (e: any) {
    fail(`not valid YAML (${e.reason || e.message})`);
  }
  return parseSchema(raw);
}

const NOTE_KEYS = [
  'type',
  'aliases',
  'tags',
  'created',
  'summary',
  'open',
  'relations',
  'dates',
  'follow-ups',
  'decisions',
  'geo',
  'address',
];
const DAILY_KEYS = ['type', 'aliases', 'tags', 'created', 'where'];
const CAPTURE_KEYS = ['type', 'date', 'exchanges'];
/** An exchange's fields beyond the collected groups (maps), which are open. */
const EXCHANGE_FIELDS = ['at', 'ended', 'source', 'procedure', 'summary', 'topics', 'where'];
const TAG_RE = /^((area|status|circle)\/)?[a-z0-9][a-z0-9-]*$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BAD_FILENAME = /[/\\:?*"<>|]/;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);
const keys = (t: Term[]) => t.map((x) => x.key).join(', ');

/** Problems with a topical note (a file at the vault root). */
export function checkNote(file: string, data: Frontmatter | null, body: string, s: Schema) {
  const id = file.replace(/\.mdx?$/, '');
  const out: string[] = [];
  const bad = (m: string) => out.push(`${file}: ${m}`);
  if (!data) return [`${file}: no frontmatter`];
  if (BAD_FILENAME.test(id))
    bad('filename has a shell-special character; put the canonical form in aliases');
  for (const k of Object.keys(data))
    if (!NOTE_KEYS.includes(k))
      bad(`unknown frontmatter field "${k}" (fields: ${NOTE_KEYS.join(', ')})`);
  if (!s.typeOf.has(data.type)) bad(`type "${data.type}" is not one of ${keys(s.types)}`);
  if (!Array.isArray(data.aliases)) bad('aliases must be a list (may be empty)');
  if (!Array.isArray(data.tags)) bad('tags must be a list');
  if (!DAY_RE.test(dateStr(data.created))) bad('created must be YYYY-MM-DD');
  if (typeof data.summary !== 'string' || !data.summary.trim())
    bad('summary is required: one sentence on what this is for Jim');
  else if (data.summary.length > 200)
    bad(`summary is ${data.summary.length} characters; keep it under 200`);

  const tags = list(data.tags);
  const facet = (f: string) =>
    tags.filter((t) => t.startsWith(`${f}/`)).map((t) => t.slice(f.length + 1));
  for (const t of tags) if (!TAG_RE.test(t)) bad(`tag "${t}" must be lowercase and hyphenated`);
  const area = facet('area');
  const status = facet('status');
  const circle = facet('circle');
  if (id !== 'Home' && area.length !== 1) bad(`needs exactly one area/ tag (${keys(s.areas)})`);
  for (const a of area) if (!s.areaOf.has(a)) bad(`area/${a} is not one of ${keys(s.areas)}`);
  if (status.length > 1) bad('at most one status/ tag');
  for (const x of status)
    if (!s.statusOf.has(x)) bad(`status/${x} is not one of ${keys(s.statuses)}`);
  if (data.type === 'person' && id !== s.owner && circle.length !== 1)
    bad(`a person needs exactly one circle/ tag (${keys(s.circles)})`);
  if (data.type !== 'person' && circle.length) bad('circle/ is only for person notes');
  for (const c of circle)
    if (!s.circleOf.has(c)) bad(`circle/${c} is not one of ${keys(s.circles)}`);
  if (
    id !== 'Home' &&
    !['person', 'moc'].includes(data.type) &&
    !tags.some((t) => s.broadTopics.has(t))
  )
    bad('needs at least one broad topic tag (meta/schema.yaml, broad)');

  if (data.type === 'place' && !data.geo && !tags.includes('fictional') && !list(data.open).length)
    bad('a place needs geo (or the tag fictional, or an open question about where it is)');

  if (!/^# \S/m.test(body)) bad('no "# Title" heading');
  if (id !== 'Home' && !/^## See also\s*$/m.test(body)) bad('no "## See also" section');
  const usesComponent = new RegExp(`<(${s.components.join('|')})\\b`).test(body);
  if (file.endsWith('.mdx') && !usesComponent)
    bad(`is .mdx but uses no component; switch it to .md with Rename in the app`);
  if (file.endsWith('.md') && usesComponent)
    bad(`uses a component, so must be .mdx: switch it with Rename in the app`);
  return out;
}

/** Problems with a daily note. */
export function checkDaily(file: string, data: Frontmatter | null, body = '') {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${file}: ${m}`);
  if (!/^daily\/\d{4}-\d{2}-\d{2}\.md$/.test(file)) bad('daily notes are daily/YYYY-MM-DD.md');
  if (!body.includes(`# ${file.slice(6, 16)}`)) bad(`no "# ${file.slice(6, 16)}" heading`);
  if (!data) return [...out, `${file}: no frontmatter`];
  for (const k of Object.keys(data))
    if (!DAILY_KEYS.includes(k))
      bad(`unknown frontmatter field "${k}" (fields: ${DAILY_KEYS.join(', ')})`);
  return out;
}

/** Problems with a day's capture log (core/capture.ts): its frontmatter, and its headings against its
 * exchanges. The turns themselves are verbatim and never checked. */
export function checkCapture(
  file: string,
  data: Frontmatter | null,
  body: string,
  ids: Set<string>,
  s: Schema,
) {
  const out: string[] = [];
  const bad = (m: string) => out.push(`${file}: ${m}`);
  const day = CAPTURE_RE.exec(file)?.[1];
  if (!day) return [`${file}: captures are one log per day, captures/YYYY-MM-DD.md`];
  if (!data) return [`${file}: no frontmatter`];
  for (const k of Object.keys(data))
    if (!CAPTURE_KEYS.includes(k))
      bad(`unknown frontmatter field "${k}" (fields: ${CAPTURE_KEYS.join(', ')})`);
  if (data.type !== 'capture') bad('type must be capture');
  if (dateStr(data.date) !== day) bad(`date ${dateStr(data.date)} doesn't match the filename`);
  const exchanges: unknown[] = Array.isArray(data.exchanges) ? data.exchanges : [];
  if (!exchanges.length) bad("exchanges must list the day's exchanges, in order");
  const sources = new Set(s.sources.map((x) => x.key));
  const procedures = new Set(s.procedures.map((x) => x.key));
  const ats: string[] = [];
  for (const [i, x] of exchanges.entries()) {
    const at = `exchange ${i + 1}`;
    if (!x || typeof x !== 'object' || Array.isArray(x)) {
      bad(`${at} must be a map`);
      continue;
    }
    const e = x as Frontmatter;
    if (typeof e.at !== 'string' || !STAMP_RE.test(e.at)) {
      bad(`${at}: at must be a quoted time with its offset, "${day}T08:12:40+02:00"`);
      continue;
    }
    ats.push(e.at);
    if (e.at.slice(0, 10) !== day) bad(`${at}: at ${e.at} is not on ${day}`);
    if (e.ended != null && (typeof e.ended !== 'string' || !STAMP_RE.test(e.ended)))
      bad(`${at}: ended must be a quoted time with its offset, like at`);
    else if (e.ended != null && Date.parse(e.ended) < Date.parse(e.at))
      bad(`${at}: ended is before at`);
    if (!sources.has(e.source))
      bad(
        `${at}: source "${e.source ?? ''}" is not one of meta/schema.yaml's sources (${keys(s.sources)})`,
      );
    if (!procedures.has(e.procedure))
      bad(
        `${at}: procedure "${e.procedure ?? ''}" is not one of meta/schema.yaml's procedures (${keys(s.procedures)})`,
      );
    if (typeof e.summary !== 'string' || !e.summary.trim())
      bad(`${at}: summary is required: one line on what the exchange was`);
    if (!Array.isArray(e.topics))
      bad(
        `${at}: topics must list the notes it was filed into ([] only for a fragment too garbled to file)`,
      );
    for (const t of list(e.topics))
      if (!ids.has(t))
        bad(
          `${at}: topics → "${t}" is not a note (renamed? use the current filename without extension)`,
        );
    if (e.where != null && !Array.isArray(e.where)) bad(`${at}: where must be a list`);
    for (const [k, v] of Object.entries(e))
      if (!EXCHANGE_FIELDS.includes(k) && (!v || typeof v !== 'object' || Array.isArray(v)))
        bad(
          `${at}: ${k} must be a map of what was collected (fields: ${EXCHANGE_FIELDS.join(', ')}, or a group)`,
        );
  }
  for (let i = 1; i < ats.length; i++)
    if (Date.parse(ats[i]) < Date.parse(ats[i - 1]))
      bad(`exchange ${i + 1} is earlier than exchange ${i}: exchanges are in time order`);
  const want = headingsFor(ats);
  const have = bodyHeadings(body);
  if (ats.length === exchanges.length && want.join() !== have.join())
    bad(
      `the body's exchange headings (${have.map((h) => `## ${h}`).join(', ') || 'none'}) must be one per exchange, in order: ${want.map((h) => `## ${h}`).join(', ')}`,
    );
  return out;
}

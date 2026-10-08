// The audit for the weekly sweep (meta/conventions.md §15): what needs judgement, not what the check already
// enforces (missing area, summary, broad topic and the like fail it instead). Tags, open questions, stale
// active items, unlinked mentions, long logs, thin notes and places. Pure: what changed since a day, and
// a file's text before it, come from the caller (git in tools/audit.ts, the backend's `since` in the app).
// Reports; changes nothing. The sweep reads each flagged note and fixes it by hand.
import type { History } from '../../core/backend.ts';
import type { Schema } from '../notes/model/schema.ts';
import { deriveGraph } from '../graph/model/graph.ts';
import { asList, titleOf, type Note } from '../notes/model/fields.ts';
import { datesOf, followUpsOf, openOf, type FollowUp } from '../notes/model/facts.ts';

/** What changed since the day: the paths, and a file's text as it was then (null if it didn't exist). */
export interface Section {
  title: string;
  rows: string[];
}

const LOG_LIMIT = 1500;

/** The day `n` days before `day`. */
export const daysBefore = (day: string, n: number) =>
  new Date(Date.parse(day) - n * 864e5).toISOString().slice(0, 10);

/** The report as text, as the sweep reads it. */
export const report = (sections: Section[]) =>
  sections
    .map(
      ({ title, rows }) =>
        `\n## ${title} (${rows.length})\n${rows.map((r) => `- ${r}\n`).join('')}`,
    )
    .join('');

export const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const prose = (b: string) =>
  b.replace(/^## (See also|References)[\s\S]*?(?=^## |$(?![\s\S]))/gm, '');
const links = (body: string) =>
  [...body.matchAll(/\]\(<?\/([^)>#]+?)\.mdx?[#>)]/g)].map((m) => decodeURI(m[1]));

// Words in dated entries (conventions §2): under a heading or a bold bullet that starts with a date.
const logWords = (body: string) => {
  let n = 0;
  let inLog = false;
  for (const line of body.split('\n')) {
    const h = line.match(/^(#{2,4}) /);
    if (h) inLog = /\b20\d\d-[01]\d-[0-3]\d\b/.test(line);
    else if (/^- \*\*20\d\d-[01]\d-[0-3]\d/.test(line)) inLog = true;
    if (inLog) n += line.split(/\s+/).filter(Boolean).length;
  }
  return n;
};

/** The report, by section. `since`: the day the week starts ("2026-09-25"); `label` names it in titles ("8 days ago"). */
export async function audit(
  pages: Note[],
  schema: Schema,
  history: History,
  today: string,
  since: string,
  label = since,
): Promise<Section[]> {
  const v = deriveGraph(pages, schema, today);
  const notes = pages
    .filter((p) => !p.id.includes('/') && p.id !== 'Home')
    .map((n) => {
      const tags = asList(n.data.tags);
      return {
        n,
        file: n.path,
        stem: n.id,
        type: String(n.data.type ?? ''),
        title: titleOf(n),
        tags,
        plain: tags.filter((t) => !t.includes('/')),
      };
    });
  const inDir = (dir: string) => pages.filter((p) => p.id.startsWith(`${dir}/`));
  const out: Section[] = [];
  const section = (title: string, rows: string[]) => out.push({ title, rows });

  // ---- Tags ----
  const count = new Map<string, number>();
  for (const n of notes) for (const t of n.plain) count.set(t, (count.get(t) ?? 0) + 1);
  section(
    `Changed since ${label} — re-read and check tags against the body`,
    notes
      .filter((n) => history.changed.has(n.file))
      .map((n) => `${n.file}  [${n.tags.join(', ')}]`),
  );
  const norm = (t: string) =>
    t
      .replace(/-/g, '')
      .replace(/(ies)$/, 'y')
      .replace(/s$/, '');
  const groups = new Map<string, string[]>();
  for (const t of count.keys()) groups.set(norm(t), [...(groups.get(norm(t)) ?? []), t]);
  section(
    'Near-duplicate tags — merge into one',
    [...groups.values()].filter((g) => g.length > 1).map((g) => g.join(' / ')),
  );
  section(
    'Tags used on one note — keep if specific, else merge into an existing tag',
    [...count]
      .filter(([, c]) => c === 1)
      .map(([t]) => `${t}  (${notes.find((n) => n.plain.includes(t))!.file})`)
      .sort((a, b) => (a < b ? -1 : 1)),
  );
  section(
    'Promotion candidates — on 5+ notes but not a broad topic (meta/schema.yaml)',
    [...count]
      .filter(([t, c]) => c >= 5 && !schema.broadTopics.has(t) && t !== 'work')
      .map(([t, c]) => `${t} (${c})`),
  );

  // ---- Beyond tags ----
  const cutoff = daysBefore(today, 30);
  const updated = (id: string) => v.updated.get(id) ?? '';
  section(
    'Active but untouched for 30+ days — ask Jim if still active',
    notes
      .filter((n) => n.tags.includes('status/active') && updated(n.stem) < cutoff)
      .map((n) => `${n.file}  (last ${updated(n.stem)})`),
  );
  section(
    'Dates passed that still read as plans — check the note',
    notes.flatMap(({ n, file }) =>
      datesOf(n)
        .filter(
          (d) =>
            /planned|\(planned\)|expected/i.test(d.what) &&
            (d.end || d.date) < today &&
            d.date.length === 10,
        )
        .map((d) => `${file}: ${d.date} ${d.what}`),
    ),
  );

  // Follow-ups (§3): due ones are what the Sign-off asks about.
  const follow = notes
    .flatMap(({ n }) => followUpsOf(n, v.byId, today))
    .sort((a, b) => (a.by || '9999').localeCompare(b.by || '9999'));
  const fuRow = (f: FollowUp) =>
    `${f.note.path}: ${f.what}${f.by ? ` (by ${f.by})` : ''}${f.whoName ? ` — ${f.whoName}` : ''}`;
  section('Follow-ups due — ask Jim whether they happened', follow.filter((f) => f.due).map(fuRow));
  section('Follow-ups not yet due', follow.filter((f) => !f.due).map(fuRow));
  section(
    'Open questions — pick the few that matter most to ask Jim',
    notes.flatMap(({ n, file }) => openOf(n).map((q) => `${file}: ${q}`)),
  );

  // Unlinked mentions: a note's title or filename in another note's prose without a link.
  const targets = notes
    .filter((n) => n.title.length >= 4 && n.type !== 'moc')
    .flatMap((n) =>
      [...new Set([n.title, n.stem])]
        .filter((t) => t.length >= 4)
        .map((t) => ({ n, t, re: new RegExp(`(^|[^\\w/])${esc(t)}(?![\\w])`) })),
    );
  const mentions = new Set<string>();
  for (const src of notes) {
    const text = prose(src.n.body)
      .replace(/\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/^#.*$/gm, ' ');
    const linked = new Set(links(src.n.body));
    for (const { n, t, re } of targets)
      if (n !== src && !linked.has(n.stem) && re.test(text))
        mentions.add(`${src.file}: mentions "${t}" → link [${t}](</${n.file}>)`);
  }
  section(
    'Possible unlinked mentions — link the first mention if it is the same thing ("Risk" in "Risk & Finance" is not the game) (§5)',
    [...mentions],
  );

  // Long logs (§2), on notes not done; listed in the week a note first crosses the limit, so each is proposed once.
  // A note that is mostly log already is the split-out log; it is meant to grow.
  const long = notes
    .filter((n) => !n.tags.includes('status/done'))
    .map((n) => ({ n, w: logWords(n.n.body), all: n.n.body.split(/\s+/).length }))
    .filter(({ w, all }) => w > LOG_LIMIT && w / all < 0.8);
  const wasLong = await Promise.all(
    long.map(async ({ n }) => {
      const old = await history.before(n.file);
      return old != null && logWords(old.replace(/^---\n[\s\S]*?\n---\n?/, '')) > LOG_LIMIT;
    }),
  );
  section(
    `Long logs — over ${LOG_LIMIT} words of dated entries since ${label}; propose to Jim moving the log or a finished episode into its own note (§2)`,
    long.filter((_, i) => !wasLong[i]).map(({ n, w }) => `${n.file}  (${w} words of log)`),
  );

  section(
    'Thin notes (under 60 words of prose) — fill from captures or research, or merge',
    notes
      .filter(
        (n) =>
          n.type !== 'moc' &&
          prose(n.n.body).replace(/^#.*$/gm, '').split(/\s+/).filter(Boolean).length < 60,
      )
      .map((n) => n.file),
  );

  // ---- Places (§3, "Places") ----
  const places = notes.filter((n) => n.type === 'place');
  const placeIds = new Set(places.map((n) => n.stem));
  section(
    'Places without geo — look up coordinates (fictional places are tagged fictional)',
    places.filter((n) => !(n.n.data.geo || n.tags.includes('fictional'))).map((n) => n.file),
  );
  section(
    'Places at street precision — re-geocode the house; drop precision when found',
    places
      .filter((n) => n.n.data.geo?.precision === 'street')
      .map((n) => `${n.file}  (${n.n.data.address ?? 'no address'})`),
  );
  section(
    'Places without address — add one if it has a door (not cities, regions, countries)',
    places
      .filter(
        (n) =>
          n.n.data.geo &&
          !n.n.data.address &&
          !n.tags.some((t) =>
            ['city', 'country', 'region', 'village', 'hometown', 'fictional'].includes(t),
          ),
      )
      .map((n) => n.file),
  );
  const dailyRows: string[] = [];
  for (const { path: f, data, body } of inDir('daily').filter((p) => p.id.slice(6) >= since)) {
    const where = asList(data.where);
    const linked = [...new Set(links(body).filter((id) => placeIds.has(id)))];
    const missing = linked.filter((p) => !where.includes(p));
    if (!where.length)
      dailyRows.push(
        `${f}: no where:${linked.length ? ` (bullets link ${linked.join(', ')})` : ' — read the bullets for where Jim was'}`,
      );
    else if (missing.length)
      dailyRows.push(`${f}: bullets link ${missing.join(', ')}, not in where:`);
  }
  section(`Daily notes since ${label} — where: missing or incomplete`, dailyRows);
  section(
    `Captures since ${label} — where: not resolved to place notes`,
    inDir('captures')
      .filter((p) => p.id.slice(9, 19) >= since)
      .flatMap(({ path: f, data }) => {
        const wheres = Array.isArray(data.exchanges)
          ? data.exchanges.flatMap((e: { where?: unknown } | null) => asList(e?.where))
          : asList(data.where);
        const loose = [...new Set(wheres)].filter((w) => !placeIds.has(w));
        return loose.length ? [`${f}: where: ${loose.join(', ')} — not place notes; resolve`] : [];
      }),
  );
  return out;
}

export type { History };

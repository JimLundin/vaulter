// Renaming a note: the file moves and every vault link to it follows, anchors kept (meta/conventions.md §5);
// switching .md/.mdx (§13) is the rename that keeps the name. When the name changes, so do the frontmatter
// fields that name it. Captures are verbatim records: their bodies stay as written, but their `topics` and
// `where` are the vault's index into them and must name current notes (schema.ts checkCapture), so they follow.
// Pure; the agent's renameNote (notes/tools.ts) runs it.
import { load as parseYaml } from 'js-yaml';
import { FRONT_RE, isVaultPath, type Frontmatter } from './note.ts';
import type { Change, VaultFile } from '../../../core/files.ts';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const idOf = (path: string) => path.replace(/\.mdx?$/, '');

/** The frontmatter without the fields that hold note ids (relations.ts checkMeta, schema.ts checkCapture). */
const withoutIds = ({ relations, where, topics, ...d }: Frontmatter) => {
  const drop = (xs: unknown, ...ks: string[]) =>
    Array.isArray(xs)
      ? xs.map((x) =>
          x && typeof x === 'object'
            ? { ...x, ...Object.fromEntries(ks.map((k) => [k, null])) }
            : x,
        )
      : xs;
  return JSON.stringify({
    ...d,
    exchanges: drop(d.exchanges, 'topics', 'where'),
    dates: drop(d.dates, 'where'),
    'follow-ups': drop(d['follow-ups'], 'who'),
    decisions: drop(d.decisions, 'who'),
  });
};

const load = (s: string): Frontmatter | null => {
  try {
    return (parseYaml(s) ?? {}) as Frontmatter;
  } catch {
    return null;
  }
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** `id` written as YAML in the style of `was`: quoted where it was, or where bare would read differently. */
const scalar = (id: string, was: string) => {
  if (was[0] === "'") return `'${id.replace(/'/g, "''")}'`;
  const bare =
    was[0] !== '"' &&
    same(load(`[${id}]`), [id]) &&
    same(load(`k: ${id}`), { k: id }) &&
    same(load(`- ${id}`), [id]);
  return bare ? id : JSON.stringify(id);
};

/** The frontmatter with each id field naming `from` naming `to`, and nothing else touched. */
function renameIds(text: string, from: string, to: string) {
  const m = FRONT_RE.exec(text);
  const data = m && load(m[1]);
  if (!(m && data)) return text;
  const rest = withoutIds(data);
  const forms = [JSON.stringify(from), `'${from.replace(/'/g, "''")}'`, from].map(esc).join('|');
  // Every scalar spelled `from` (a list item, a flow item, a value); each kept only if it was an id field's.
  const re = new RegExp(
    `(?<=(?:[\\[,]|[:-][ \\t])[ \\t]*)(?:${forms})(?=[ \\t]*(?:[\\],}]|$))`,
    'gm',
  );
  let [, front] = m;
  for (const c of [...front.matchAll(re)].reverse()) {
    const next = front.slice(0, c.index) + scalar(to, c[0]) + front.slice(c.index + c[0].length);
    const d = load(next);
    if (d && withoutIds(d) === rest) front = next;
  }
  return front === m[1] ? text : text.replace(m[1], () => front);
}

/** The changes that move `from` to `to` (vault paths) and point everything at it there. Throws when `from`
 * isn't a file, or `to` isn't a vault path or is taken (by any extension: a note's id is its path without one). */
export function renameNote(files: VaultFile[], from: string, to: string): Change[] {
  if (!files.some((f) => f.path === from)) throw new Error(`no such file: ${from}`);
  if (!isVaultPath(to))
    throw new Error(
      `${to} isn't a vault page: notes at the root (.md, .mdx), daily/, captures/, meta/ (.md)`,
    );
  if (to === from) throw new Error(`${from} is already called that`);
  const taken = files.find((f) => f.path !== from && idOf(f.path) === idOf(to));
  if (taken) throw new Error(`${taken.path} exists`);

  // "</From.md>", "</From.md#h>", and href "/From.md…" in MDX props.
  const links = new RegExp(`(</|["']/)${esc(from)}(?=[>#"'])`, 'g');
  const ids = idOf(from) !== idOf(to);
  const out: Change[] = [{ path: from, text: null }];
  for (const f of files) {
    if (!isVaultPath(f.path)) continue;
    let t = f.path.startsWith('captures/') ? f.text : f.text.replace(links, (_, pre) => pre + to);
    if (ids) t = renameIds(t, idOf(from), idOf(to));
    if (f.path === from) out.push({ path: to, text: t });
    else if (t !== f.text) out.push({ path: f.path, text: t });
  }
  return out;
}

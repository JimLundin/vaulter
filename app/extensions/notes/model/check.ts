// The vault's check: a broken internal link or heading anchor, a [[wikilink]], or any frontmatter or
// structure that breaks the vault's schema (meta/schema.yaml; the rules in schema.ts, relations.ts). Pure,
// over `{ path, text }[]`, so it runs in Node (tools/check.ts) and in the browser before a commit.
import type { Nodes, Root } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import GithubSlugger from 'github-slugger';
import { toString as textOf } from 'mdast-util-to-string';
import { parseVaultLink } from './paths.ts';
import { checkMeta } from '../../graph/model/relations.ts';
import { checkNote, checkDaily, checkCapture, schemaOf, type Schema } from './schema.ts';
import { loadNotes } from './note.ts';
import { type VaultFile } from '../../../core/files.ts';
import { mdxProblems } from './mdx-rules.ts';
import { isSafeUrl } from './safe-url.ts';

const parser = unified().use(remarkParse).use(remarkGfm);
const walk = (n: Nodes, f: (n: Nodes) => void) => {
  f(n);
  if ('children' in n) for (const c of n.children) walk(c, f);
};

/** -> problems; `ok`, the number of internal links that resolve; `files`, the number of pages. */
export function checkVault(files: VaultFile[]): { problems: string[]; ok: number; files: number } {
  const notes = loadNotes(files);
  let schema: Schema; // without one, nothing else can be judged
  try {
    schema = schemaOf(files);
  } catch (e: any) {
    return { problems: [e.message], ok: 0, files: notes.length };
  }
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const byId = new Map(notes.map((n) => [n.id, n.path])); // "Ada" -> "Ada.md"
  const trees = new Map<string, Root>();
  const anchors = new Map<string, Set<string>>();
  for (const n of notes) {
    const tree = parser.parse(n.body);
    const slugger = new GithubSlugger();
    const set = new Set<string>();
    walk(tree, (x) => {
      if (x.type === 'heading') set.add(slugger.slug(textOf(x)));
    });
    trees.set(n.path, tree);
    anchors.set(n.path, set);
  }

  const problems: string[] = [];
  let ok = 0;
  const check = (from: string, url: string) => {
    if (!isSafeUrl(url))
      return problems.push(
        `${from}: ${url} → only relative, http(s), mailto and tel links are allowed`,
      );
    const p = parseVaultLink(url);
    if (!p) return;
    const target = p.id + (/\.mdx$/.test(url.split('#')[0]) ? '.mdx' : '.md');
    if (!byPath.has(target)) {
      const other = byId.get(p.id);
      problems.push(
        `${from}: ${url} → missing${other ? ` (the note is ${other} — fix the extension)` : ''}`,
      );
    } else if (p.hash && !anchors.get(target)!.has(p.hash)) {
      problems.push(`${from}: ${url} → no heading #${p.hash} in ${target}`);
    } else ok++;
  };

  for (const n of notes) {
    if (n.id.startsWith('captures/')) continue; // verbatim records; not held to link rules
    walk(trees.get(n.path)!, (x) => {
      if (x.type === 'link' || x.type === 'definition' || x.type === 'image') check(n.path, x.url);
      if (x.type === 'text' && x.value.includes('[['))
        for (const m of x.value.matchAll(/\[\[[^\]]+\]\]/g))
          problems.push(`${n.path}: ${m[0]} → use a Markdown link [label](</Note.md>)`);
      if (x.type === 'html' && n.ext === 'md')
        problems.push(
          `${n.path}: raw HTML is not rendered (line ${x.position?.start.line}); use Markdown, or a component in an .mdx note`,
        );
    });
    if (n.ext === 'mdx') {
      for (const m of n.body.matchAll(/href\s*[:=]\s*["']([^"']+)["']/g)) check(n.path, m[1]);
      for (const p of mdxProblems(n.body, schema.components)) problems.push(`${n.path}: ${p}`);
    }
  }

  // Frontmatter and structure.
  const noteIds = new Set(notes.filter((n) => !n.id.includes('/')).map((n) => n.id));
  for (const n of notes) {
    const data = n.front ? n.data : null;
    if (!n.id.includes('/')) {
      problems.push(...checkNote(n.path, data, n.body, schema));
      if (data) problems.push(...checkMeta(n.id, data, noteIds, schema.predicates));
    } else if (n.id.startsWith('daily/')) {
      problems.push(...checkDaily(n.path, data, n.body));
      if (data) problems.push(...checkMeta(n.id, data, noteIds, schema.predicates));
    } else if (n.id.startsWith('captures/'))
      problems.push(...checkCapture(n.path, data, n.body, noteIds, schema));
  }
  for (const n of notes)
    if (n.error) problems.push(`${n.path}: frontmatter is not valid YAML (${n.error})`);
  return { problems, ok, files: notes.length };
}

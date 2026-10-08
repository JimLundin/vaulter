// The graph's check: every link resolves to a note (and its #heading), every relation is one of the
// vocabulary's predicates, and every note a field names exists. What a note is, and what it may say, is
// the notes' check. Pure, so it runs in Node (tools/check.ts) and in the browser.
import type { VaultFile } from '../files.ts';
import { loadNotes } from '../documents/notes/note.ts';
import { schemaOf } from '../documents/notes/schema.ts';
import { anchorsOf, urlsOf } from '../documents/notes/links.ts';
import { parseVaultLink } from '../documents/notes/paths.ts';
import { refsOf, relationsOf } from '../documents/notes/refs.ts';

/** -> problems; `ok`, the number of internal links that resolve. */
export function checkGraph(files: VaultFile[]): { problems: string[]; ok: number } {
  const notes = loadNotes(files);
  let predicates: ReturnType<typeof schemaOf>['predicates'];
  try {
    predicates = schemaOf(files).predicates;
  } catch {
    return { problems: [], ok: 0 }; // the notes' check says why
  }
  const byPath = new Map(notes.map((n) => [n.path, n]));
  const problems: string[] = [];
  let ok = 0;

  for (const n of notes) {
    if (n.id.startsWith('captures/')) continue; // verbatim records; their links aren't held to resolve
    for (const url of urlsOf(n)) {
      const p = parseVaultLink(url);
      if (!p) continue;
      const target = `${p.id}.md`;
      const note = byPath.get(target);
      if (!note) problems.push(`${n.path}: ${url} → missing`);
      else if (p.hash && !anchorsOf(note).has(p.hash))
        problems.push(`${n.path}: ${url} → no heading #${p.hash} in ${target}`);
      else ok++;
    }
  }

  const ids = new Set(notes.filter((n) => !n.id.includes('/')).map((n) => n.id));
  for (const n of notes) {
    if (!n.front) continue;
    for (const { predicate } of relationsOf(n))
      if (!predicates[predicate])
        problems.push(`${n.id}: unknown relation "${predicate}" (see meta/schema.yaml)`);
    for (const r of refsOf(n))
      if (!ids.has(r.target)) problems.push(`${r.at} → "${r.target}" is not a note${r.hint}`);
      else if (r.predicate && r.target === n.id) problems.push(`${r.at} → itself`);
  }
  return { problems, ok };
}

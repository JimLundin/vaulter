// The notes' check: each file as a note, on its own: its frontmatter against the vocabulary
// (meta/schema.yaml; the rules in schema.ts and structured.ts), its structure, and that its links are
// links the app may follow. Whether links and fields name notes that exist is the graph's
// check. Pure, over `{ path, text }[]`, so it runs in Node (tools/check.ts) and in the browser.
import type { VaultFile } from '../../../core/files.ts';
import { checkFields } from './structured.ts';
import { checkNote, checkDaily, checkCapture, schemaOf, type Schema } from './schema.ts';
import { loadNotes } from './note.ts';
import { isSafeUrl } from './safe-url.ts';
import { treeOf, urlsOf, walk } from './links.ts';

/** -> problems; `files`, the number of pages. */
export function checkNotes(files: VaultFile[]): { problems: string[]; files: number } {
  const notes = loadNotes(files);
  let schema: Schema; // without one, nothing else can be judged
  try {
    schema = schemaOf(files);
  } catch (e: any) {
    return { problems: [e.message], files: notes.length };
  }
  const problems: string[] = [];
  for (const n of notes) {
    if (n.id.startsWith('captures/')) continue; // verbatim records; not held to link rules
    for (const url of urlsOf(n))
      if (!isSafeUrl(url))
        problems.push(
          `${n.path}: ${url} → only relative, http(s), mailto and tel links are allowed`,
        );
    walk(treeOf(n), (x) => {
      if (x.type === 'text' && x.value.includes('[['))
        for (const m of x.value.matchAll(/\[\[[^\]]+\]\]/g))
          problems.push(`${n.path}: ${m[0]} → use a Markdown link [label](</Note.md>)`);
      if (x.type === 'html')
        problems.push(
          `${n.path}: raw HTML is not rendered (line ${x.position?.start.line}); use Markdown`,
        );
    });
  }

  // Frontmatter and structure.
  for (const n of notes) {
    const data = n.front ? n.data : null;
    if (!n.id.includes('/')) {
      problems.push(...checkNote(n.path, data, n.body, schema));
      if (data) problems.push(...checkFields(n.id, data));
    } else if (n.id.startsWith('daily/')) {
      problems.push(...checkDaily(n.path, data, n.body));
      if (data) problems.push(...checkFields(n.id, data));
    } else if (n.id.startsWith('captures/'))
      problems.push(...checkCapture(n.path, data, n.body, schema));
  }
  for (const n of notes)
    if (n.error) problems.push(`${n.path}: frontmatter is not valid YAML (${n.error})`);
  return { problems, files: notes.length };
}

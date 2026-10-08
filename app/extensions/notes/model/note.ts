// The vault as data: every page parsed from its file's text. Pure (no fs), so the same code
// runs in Node (check, audit, build) and in the browser. A source supplies `{ path, text }[]` with
// paths relative to the vault root ("Ada.md", "daily/2026-06-06.md").
import { load } from 'js-yaml';
import type { VaultFile } from '../../../core/files.ts';

/** Parsed YAML frontmatter: whatever the note says; the check holds it to the schema. */
export type Frontmatter = Record<string, any>;

/** The vault's vocabulary (app/extensions/notes/model/schema.ts): data, not a page. */
export const SCHEMA_PATH = 'meta/schema.yaml';

/** Pages: notes at the root (.md or .mdx), daily logs, captures and the conventions; not the README. */
const isPagePath = (path: string) =>
  path !== 'README.md' &&
  /^(?:[^/.][^/]*\.mdx?|(?:daily|captures|meta)\/[^/.][^/]*\.md)$/.test(path);

/** What a source supplies: the pages and the schema. */
export const isVaultPath = (path: string) => path === SCHEMA_PATH || isPagePath(path);

// Frontmatter: a leading ---…--- block of YAML.
export const FRONT_RE = /^\uFEFF?---([\s\S]*?\n)---/;

/**
 * One file -> a note: `id` is the path without extension ("daily/2026-06-06"); `body` is the text after
 * the frontmatter, trimmed; `data` the parsed frontmatter ({} if none). `front` is false when there is
 * no frontmatter block and `error` holds the YAML error, for the check to report.
 */
export function parseNote({ path, text }: VaultFile) {
  const m = FRONT_RE.exec(text);
  let data: Frontmatter = {};
  let error = '';
  if (m) {
    try {
      const parsed = load(m[1]);
      if (parsed && typeof parsed === 'object') data = parsed;
    } catch (e: any) {
      error = e.reason || e.message;
    }
  }
  const body = (m ? text.replace(`---${m[1]}---`, '') : text).trim();
  return {
    id: path.replace(/\.mdx?$/, ''),
    path,
    ext: (path.endsWith('.mdx') ? 'mdx' : 'md') as 'md' | 'mdx',
    data,
    body,
    front: !!m,
    error,
  };
}

/** Every page in the files, ordered by id. */
export const loadNotes = (files: VaultFile[]) =>
  files
    .filter((f) => isPagePath(f.path))
    .map(parseNote)
    .sort((a, b) => a.id.localeCompare(b.id, 'en'));

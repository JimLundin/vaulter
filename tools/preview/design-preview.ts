import { cpSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Git branch slashes remain path separators; URL characters stay within each segment. */
export function previewPath(branch: string): string {
  const segments = branch.split('/');
  if (
    branch === 'main' ||
    segments.some((segment) => !segment || segment === '.' || segment === '..') ||
    branch.includes('\\') ||
    [...branch].some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error('A preview requires a non-main branch with a valid relative path.');
  return `preview/${segments.map(encodeURIComponent).join('/')}/`;
}

/** Every preview is sample-only, whether built now or restored from Actions. */
export function copyPreview(source: string, output: string, branch: string, commit: string) {
  previewPath(branch);
  const validate = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) validate(join(directory, entry.name));
      else if (!entry.isFile() || entry.name === 'secrets.json' || entry.name === 'sw.js')
        throw new Error(
          'The sample preview must contain only ordinary files without credentials or a service worker.',
        );
    }
  };
  validate(source);
  // Disk paths use the branch spelling; previewPath escapes only the published URL.
  const destination = join(output, 'preview', ...branch.split('/'));
  cpSync(source, destination, { recursive: true });
  writeFileSync(
    join(destination, 'version.json'),
    JSON.stringify({ commit, branch, sample: true }),
  );
}

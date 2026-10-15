import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test } from 'vitest';
import { copyPreview, previewPath } from './design-preview.ts';

test('preview URLs follow the branch name and cannot escape the preview directory', () => {
  expect(previewPath('structure')).toBe('preview/structure/');
  expect(previewPath('feature/input')).toBe('preview/feature/input/');
  expect(previewPath('design#1')).toBe('preview/design%231/');
  for (const branch of ['main', '', '../main', 'feature/../main', '/feature', 'feature\\input'])
    expect(() => previewPath(branch)).toThrow();
});

test('branch previews coexist without altering production or including credentials', () => {
  const root = mkdtempSync(join(tmpdir(), 'vaulter-preview-packaging-'));
  try {
    const source = join(root, 'sample');
    const output = join(root, 'pages');
    mkdirSync(source);
    mkdirSync(output);
    writeFileSync(join(source, 'index.html'), 'sample app');
    writeFileSync(join(output, 'index.html'), 'production app');
    writeFileSync(join(output, 'version.json'), '{"commit":"production"}');
    copyPreview(source, output, 'structure', 'first');
    copyPreview(source, output, 'feature/input', 'second');
    expect(readFileSync(join(output, 'index.html'), 'utf8')).toBe('production app');
    expect(readFileSync(join(output, 'version.json'), 'utf8')).toBe('{"commit":"production"}');
    for (const [branch, commit] of [
      ['structure', 'first'],
      ['feature/input', 'second'],
    ]) {
      expect(readFileSync(join(output, 'preview', branch, 'index.html'), 'utf8')).toBe(
        'sample app',
      );
      expect(
        JSON.parse(readFileSync(join(output, 'preview', branch, 'version.json'), 'utf8')),
      ).toEqual({ commit, branch, sample: true });
    }
    mkdirSync(join(source, 'nested'));
    for (const file of ['secrets.json', 'sw.js']) {
      writeFileSync(join(source, 'nested', file), 'must not publish');
      expect(() => copyPreview(source, output, 'other', 'third')).toThrow(/credentials/);
      rmSync(join(source, 'nested', file));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

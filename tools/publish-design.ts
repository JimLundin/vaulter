// GitHub Pages deploys one complete artifact. Preserve the deployed production files byte-for-byte
// from its successful Actions artifact, and add this branch's sample-only design preview.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { copyPreview, previewPath } from './design-preview.ts';

const repo = process.env.GITHUB_REPOSITORY;
const commit = process.env.GITHUB_SHA;
const branch = process.env.GITHUB_REF_NAME;
if (!(repo && commit && branch))
  throw new Error('GITHUB_REPOSITORY, GITHUB_SHA and GITHUB_REF_NAME are required.');
const preview = previewPath(branch);
const api = <T>(path: string): T =>
  JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8' }));
const pages = <T>(path: string): T[] =>
  JSON.parse(execFileSync('gh', ['api', path, '--paginate', '--slurp'], { encoding: 'utf8' }));
const site = api<{ html_url: string }>(`repos/${repo}/pages`).html_url;
const deployed = await fetch(new URL('version.json', site));
if (!deployed.ok) throw new Error('Cannot identify the currently deployed production version.');
const production: { commit: string } = await deployed.json();
if (!/^[a-f0-9]{40}$/.test(production.commit)) throw new Error('Invalid production commit.');
const runs = api<{ workflow_runs: { id: number; head_sha: string; conclusion: string }[] }>(
  `repos/${repo}/actions/workflows/deploy.yml/runs?branch=main&status=success&per_page=100`,
);
const run = runs.workflow_runs.find(
  (candidate) => candidate.head_sha === production.commit && candidate.conclusion === 'success',
);
if (!run) throw new Error('The deployed production build has no available successful run.');
const artifacts = api<{ artifacts: { id: number; name: string; expired: boolean }[] }>(
  `repos/${repo}/actions/runs/${run.id}/artifacts`,
);
const artifact = artifacts.artifacts.find(
  (candidate) => candidate.name === 'github-pages' && !candidate.expired,
);
if (!artifact)
  throw new Error(
    'The deployed production artifact has expired. Refresh production before publishing a preview.',
  );

const scratch = mkdtempSync(join(tmpdir(), 'vaulter-pages-'));
try {
  execFileSync('gh', [
    'run',
    'download',
    String(run.id),
    '--repo',
    repo,
    '--name',
    'github-pages',
    '--dir',
    scratch,
  ]);
  const archive = join(scratch, 'artifact.tar');
  if (!existsSync(archive))
    throw new Error('The production Pages artifact is missing artifact.tar.');
  const paths = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  if (paths.some((path) => path.startsWith('/') || path.split('/').includes('..')))
    throw new Error('The production artifact contains an invalid path.');
  const output = resolve('dist-pages');
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output);
  execFileSync('tar', ['-xf', archive, '-C', output]);
  const preserved = JSON.parse(readFileSync(join(output, 'version.json'), 'utf8'));
  if (preserved.commit !== production.commit)
    throw new Error('The production artifact does not match the deployed site.');
  const digest = (directory: string): string => {
    const hash = createHash('sha256');
    const visit = (root: string, relative = '') => {
      for (const entry of readdirSync(join(root, relative), { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const path = join(relative, entry.name);
        if (!relative && entry.name === 'preview') continue;
        if (entry.isDirectory()) visit(root, path);
        else if (entry.isFile()) {
          hash.update(path);
          hash.update(readFileSync(join(root, path)));
        } else throw new Error('Pages files must be ordinary files and directories.');
      }
    };
    visit(directory);
    return hash.digest('hex');
  };
  const original = digest(output);
  rmSync(join(output, 'preview'), { recursive: true, force: true });
  // Restore the latest successful, retained preview for every other branch. The Pages artifact
  // replaces the complete site, so retaining only production would erase those branch previews.
  const previews = pages<{
    workflow_runs: { id: number; head_branch: string; head_sha: string }[];
  }>(`repos/${repo}/actions/workflows/deploy.yml/runs?status=success&per_page=100`).flatMap(
    (page) => page.workflow_runs,
  );
  const previewArtifacts = pages<{
    artifacts: { expired: boolean; workflow_run: { id: number } }[];
  }>(`repos/${repo}/actions/artifacts?name=design-preview&per_page=100`).flatMap(
    (page) => page.artifacts,
  );
  const retainedRuns = new Set(
    previewArtifacts.filter((item) => !item.expired).map((item) => item.workflow_run.id),
  );
  const restored = new Set([branch, 'main']);
  const available: { id: number; branch: string; commit: string }[] = [];
  for (const candidate of previews) {
    if (restored.has(candidate.head_branch)) continue;
    if (!retainedRuns.has(candidate.id)) continue;
    previewPath(candidate.head_branch);
    restored.add(candidate.head_branch);
    available.push({ id: candidate.id, branch: candidate.head_branch, commit: candidate.head_sha });
  }
  // A branch named feature and one named feature/input may share a directory ancestor.
  available.sort((a, b) => a.branch.split('/').length - b.branch.split('/').length);
  for (const candidate of available) {
    const source = join(scratch, String(candidate.id));
    execFileSync('gh', [
      'run',
      'download',
      String(candidate.id),
      '--repo',
      repo,
      '--name',
      'design-preview',
      '--dir',
      source,
    ]);
    copyPreview(source, output, candidate.branch, candidate.commit);
  }
  copyPreview('dist-preview', output, branch, commit);
  if (digest(output) !== original) throw new Error('Preview packaging changed production files.');
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary)
    writeFileSync(
      summary,
      `Preview: ${new URL(preview, site).href}\n\nComponent kit: ${new URL(`${preview}kit/`, site).href}\n\nProduction preserved at ${production.commit}.\n`,
    );
  console.log(
    `Prepared preview for ${commit.slice(0, 7)}; preserved production ${production.commit.slice(0, 7)}.`,
  );
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(process.env.GITHUB_OUTPUT, `preview_url=${new URL(preview, site).href}\n`, {
      flag: 'a',
    });
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

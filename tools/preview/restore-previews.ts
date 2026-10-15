// Restore retained sample artifacts independently of the full workflow/test result.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { copyPreview, previewPath } from './design-preview.ts';

export interface RetainedPreview {
  id: number;
  created_at: string;
  expired: boolean;
  workflow_run: { id: number; head_branch: string; head_sha: string };
}

export function latestPreviews(
  artifacts: readonly RetainedPreview[],
  excluded: readonly string[] = [],
) {
  const seen = new Set(['main', ...excluded]);
  const selected: RetainedPreview[] = [];
  for (const artifact of [...artifacts].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id,
  )) {
    const branch = artifact.workflow_run.head_branch;
    if (artifact.expired || seen.has(branch)) continue;
    previewPath(branch);
    seen.add(branch);
    selected.push(artifact);
  }
  return selected.sort(
    (a, b) =>
      a.workflow_run.head_branch.split('/').length - b.workflow_run.head_branch.split('/').length,
  );
}

export function restorePreviews(
  repo: string,
  output: string,
  scratch: string,
  excluded: readonly string[] = [],
) {
  const pages: { artifacts: RetainedPreview[] }[] = JSON.parse(
    execFileSync(
      'gh',
      [
        'api',
        `repos/${repo}/actions/artifacts?name=design-preview&per_page=100`,
        '--paginate',
        '--slurp',
      ],
      { encoding: 'utf8' },
    ),
  );
  for (const artifact of latestPreviews(
    pages.flatMap((page) => page.artifacts),
    excluded,
  )) {
    const source = join(scratch, String(artifact.id));
    execFileSync('gh', [
      'run',
      'download',
      String(artifact.workflow_run.id),
      '--repo',
      repo,
      '--name',
      'design-preview',
      '--dir',
      source,
    ]);
    copyPreview(source, output, artifact.workflow_run.head_branch, artifact.workflow_run.head_sha);
  }
}

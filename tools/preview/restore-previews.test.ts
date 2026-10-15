import { expect, test } from 'vitest';
import { latestPreviews, type RetainedPreview } from './restore-previews.ts';

const artifact = (id: number, branch: string, expired = false): RetainedPreview => ({
  id,
  created_at: `2026-10-${String(id).padStart(2, '0')}T00:00:00Z`,
  expired,
  workflow_run: { id, head_branch: branch, head_sha: `commit-${id}` },
});

test('main preserves the latest retained preview per branch, even before tests finish', () => {
  const selected = latestPreviews([
    artifact(1, 'feature'),
    artifact(2, 'feature/input'),
    artifact(3, 'feature'),
    artifact(4, 'main'),
    artifact(5, 'feature', true),
    artifact(6, 'other'),
  ]);
  expect(selected.map((item) => item.id)).toEqual([6, 3, 2]);
  expect(latestPreviews(selected, ['other']).map((item) => item.id)).toEqual([3, 2]);
});

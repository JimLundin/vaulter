import { describe, expect, it } from 'vitest';
import type { Checks, SourceV1 } from '@contracts/extensions.source';
import { changedUnits, overlay, raises, review, summary } from './drafts.ts';
import { Statics } from './extension.ts';
import type { Tree } from './loader.ts';

const tree = (commit: string, files: Record<string, string>): Tree => ({
  commit,
  files: new Map(Object.entries(files)),
});

const main = tree('main1', {
  'extensions/wiki/index.ts': 'w1',
  'extensions/wiki/revise.ts': 'r1',
  'extensions/map/index.ts': 'm1',
  'contracts/records/index.ts': 'c1',
});
const draft = tree('draft1', {
  'extensions/wiki/index.ts': 'w2',
  'extensions/map/index.ts': 'm1',
  'extensions/workouts/index.ts': 'k1',
  'contracts/records/index.ts': 'c1',
});

describe('drafts', () => {
  it('find the extensions a draft adds, changes or removes', () => {
    expect(changedUnits(main, draft)).toEqual(['wiki', 'workouts']);
  });

  it("load a draft's changed folders on top of main, whole", () => {
    const { tree: t, origins } = overlay(main, [{ branch: 'draft/workouts', tree: draft }]);
    expect(Object.fromEntries(t.files)).toEqual({
      'extensions/wiki/index.ts': 'w2',
      'extensions/map/index.ts': 'm1',
      'extensions/workouts/index.ts': 'k1',
      'contracts/records/index.ts': 'c1',
    });
    expect(Object.fromEntries(origins)).toEqual({
      wiki: 'draft/workouts',
      workouts: 'draft/workouts',
    });
    expect(t.commit).toBe('main1+draft1');
  });

  it('say in plain words what a change newly asks for', () => {
    const s = (more: object) => summary(Statics.parse({ id: 'map', version: '1.3.0', ...more }));
    const before = s({ permissions: { network: ['tile.openstreetmap.org'] } });
    const after = s({
      version: '1.4.0',
      permissions: {
        network: ['tile.openstreetmap.org', 'api.mapbox.com'],
        device: ['geolocation'],
      },
      secrets: { token: { label: 'Mapbox', hosts: ['api.mapbox.com'] } },
      requires: { k: { kind: 'contract', name: 'kernel', version: 1 } },
    });
    expect(raises(before, after)).toEqual([
      'reach api.mapbox.com',
      'use the geolocation',
      'hold a secret (token: api.mapbox.com)',
      'manage extensions, access and approvals (kernel@1)',
    ]);
  });

  it('are reviewed against main: files, static fields and checks', async () => {
    const trees: Record<string, Tree> = { main1: main, draft1: draft };
    const src = {
      head: (_: string, ref: string) => Promise.resolve(ref === 'main' ? 'main1' : 'draft1'),
      checks: (): Promise<Checks> =>
        Promise.resolve({ state: 'success', runs: [{ name: 'test', state: 'success' }] }),
    } as unknown as SourceV1;
    const r = await review(
      {
        src,
        repo: 'o/r',
        ref: 'main',
        treeAt: (c) => Promise.resolve(trees[c]),
        inspect: (id, t) =>
          Promise.resolve(
            Statics.parse({
              id,
              version: t.commit === 'main1' ? '1.0.0' : '2.0.0',
              author: id === 'workouts' ? { kind: 'agent', reason: 'Runs in 6 notes' } : undefined,
              permissions:
                t.commit === 'draft1' && id === 'wiki' ? { network: ['example.org'] } : undefined,
            }),
          ),
      },
      'draft/workouts',
    );
    expect(r.files).toEqual([
      { path: 'extensions/wiki/index.ts', status: 'changed' },
      { path: 'extensions/wiki/revise.ts', status: 'removed' },
      { path: 'extensions/workouts/index.ts', status: 'added' },
    ]);
    expect(
      r.extensions.map((e) => [e.id, e.change, e.before?.version, e.after?.version, e.raises]),
    ).toEqual([
      ['wiki', 'changed', '1.0.0', '2.0.0', ['reach example.org']],
      ['workouts', 'added', undefined, '2.0.0', []],
    ]);
    expect(r.extensions[1].after?.author).toEqual({ kind: 'agent', reason: 'Runs in 6 notes' });
    expect(r.checks.state).toBe('success');
  });
});

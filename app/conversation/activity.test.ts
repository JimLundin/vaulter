import { describe, expect, it } from 'vitest';
import { liveLabel, running, segments, summarize, type ToolPart } from './activity.ts';
import type { Part } from './view.ts';
import type { ToolPresentationAdapter } from '@/agent/presentation/tool-presentation.tsx';

const tool = (name: string, extra: Partial<ToolPart> = {}): ToolPart => ({
  kind: 'tool',
  name,
  input: {},
  status: 'complete',
  ...extra,
});
const presentation: ToolPresentationAdapter = (evidence) => {
  if (evidence.name !== 'record' || evidence.version !== undefined) return;
  return {
    title: 'Record evidence',
    live: 'Recording evidence',
    done: (count) => `recorded ${count} entries`,
    receipt: null,
  };
};

describe('segments', () => {
  it('folds consecutive calls and keeps text where it was said', () => {
    const parts: Part[] = [
      { kind: 'text', text: 'Looking.' },
      tool('readFile'),
      tool('readFile'),
      { kind: 'text', text: 'Found it.' },
      tool('commit'),
    ];
    expect(
      segments(parts).map((segment) => (segment.kind === 'text' ? 'text' : segment.parts.length)),
    ).toEqual(['text', 2, 'text', 1]);
  });
});

describe('summarize', () => {
  it('uses supplied owner wording and groups in first-use order', () => {
    expect(summarize([tool('record'), tool('weather'), tool('record')], [presentation])).toBe(
      'Recorded 2 entries · used weather',
    );
  });
  it('does not merge versions or uncertain, failed and unsaved outcomes into success', () => {
    expect(
      summarize(
        [
          tool('record'),
          tool('record', { version: 'future' }),
          tool('record', { status: 'running' }),
          tool('record', { status: 'failed', error: 'Rejected' }),
          tool('record', { savePending: true }),
        ],
        [presentation],
      ),
    ).toBe(
      'Recorded 1 entries · used record (future) · record: outcome uncertain · record: failed · record: completed; save pending',
    );
  });
  it('keeps retired action names through generic fallback', () => {
    expect(summarize([tool('renameNote'), tool('renameNote'), tool('readFile')])).toBe(
      'Used renameNote 2 times · used readFile',
    );
  });
});

describe('live status', () => {
  it('finds an explicit running execution and uses the owner label', () => {
    const parts = [tool('record'), tool('record', { status: 'running' })];
    expect(running(parts)).toBe(parts[1]);
    expect(liveLabel(parts[1]!, [presentation])).toBe('Recording evidence…');
    expect(liveLabel(tool('future', { version: '2' }))).toBe('Using future (2)…');
  });
});

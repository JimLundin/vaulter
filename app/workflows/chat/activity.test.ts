import { describe, expect, it } from 'vitest';
import { liveLabel, running, segments, summarize, type ToolPart } from './activity.ts';
import type { Part } from './conversation.ts';

const tool = (name: string, input = '', extra: Partial<ToolPart> = {}): ToolPart => ({
  kind: 'tool',
  name,
  input,
  result: 'ok',
  ...extra,
});

describe('segments', () => {
  it('folds consecutive tool calls and keeps text where it was said', () => {
    const parts: Part[] = [
      { kind: 'text', text: 'Looking.' },
      tool('readFile', 'a.md'),
      tool('readFile', 'b.md'),
      { kind: 'text', text: 'Found it.' },
      tool('commit'),
    ];
    expect(segments(parts).map((s) => (s.kind === 'text' ? 'text' : s.parts.length))).toEqual([
      'text',
      2,
      'text',
      1,
    ]);
  });
});

describe('summarize', () => {
  it('counts each tool in order of first use', () => {
    expect(
      summarize([tool('readFile'), tool('writeFile'), tool('readFile'), tool('writeFile')]),
    ).toBe('Read 2 files · staged 2 files');
  });
  it('gives the check and commit their outcome', () => {
    expect(
      summarize([
        tool('check', '', { result: 'check passes' }),
        tool('commit', '', { commit: 'abc1234' }),
      ]),
    ).toBe('Check passes · committed abc1234');
  });
  it('counts failures and names unknown tools', () => {
    expect(summarize([tool('weather'), tool('weather', '', { error: true })])).toBe(
      'Used weather 2 times · 1 failed',
    );
  });
});

describe('live status', () => {
  it('finds the call without a result and says what it does', () => {
    const parts = [tool('readFile', 'a.md'), tool('readFile', 'b.md', { result: undefined })];
    const live = running(parts);
    expect(live?.input).toBe('b.md');
    expect(liveLabel(live!)).toBe('Reading b.md…');
    expect(liveLabel(tool('check'))).toBe('Running the check…');
  });
});

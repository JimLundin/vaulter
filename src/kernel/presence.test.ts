import { describe, expect, it } from 'vitest';
import { asPerson, GESTURE_MS, presence } from './presence.ts';

describe('person presence', () => {
  const clock = () => {
    let t = 1000;
    return {
      now: () => t,
      pass: (ms: number) => {
        t += ms;
      },
    };
  };

  it('lets the extension a person acted in make one personal call, and no other extension', () => {
    const p = presence(() => true);
    const tap = asPerson(p, 'settings', (_e: { isTrusted: boolean }) => 'handled');
    expect(tap({ isTrusted: true })).toBe('handled');
    expect(p.take('agent')).toBe(false);
    expect(p.take('settings')).toBe(true);
    expect(p.take('settings')).toBe(false);
  });

  it('grants nothing for an event made by code', () => {
    const p = presence(() => true);
    asPerson(p, 'settings', () => undefined)({ isTrusted: false });
    expect(p.take('settings')).toBe(false);
  });

  it('lasts a few seconds, and only while the browser counts the gesture as recent', () => {
    const c = clock();
    let active = true;
    const p = presence(() => active, c.now);
    p.grant('settings');
    c.pass(GESTURE_MS + 1);
    expect(p.take('settings')).toBe(false);
    p.grant('settings');
    active = false;
    expect(p.take('settings')).toBe(false);
  });
});

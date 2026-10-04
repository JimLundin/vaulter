// The keyboard: commands' keys (extension.ts Command.keys) and moving through lists. Keys are "mod+k"
// (⌘ on a Mac, Ctrl elsewhere), "g c" (one key, then the next within a second), or one key ("e", "?").
// Plain keys don't fire while typing; mod keys do. Lists: rows marked data-nav move with j/k, and with
// ↑/↓ once one has focus (otherwise the arrows scroll the page); Enter opens, Escape leaves the list.
import { useEffect, useRef } from 'react';

export interface Binding {
  keys: string;
  run: () => void;
}

const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
/** Keys as shown: "mod+k" → "⌘K" / "Ctrl K", "g c" → "G then C". */
export const showKeys = (keys: string) =>
  keys.split(' ').map((step) =>
    step
      .split('+')
      .map((k) =>
        k === 'mod'
          ? MAC
            ? '⌘'
            : 'Ctrl'
          : k === 'shift'
            ? '⇧'
            : k.length === 1
              ? k.toUpperCase()
              : k,
      )
      .join(MAC ? '' : ' '),
  );

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  // biome-ignore lint/security/noSecrets: a CSS selector, not a secret
  (t.isContentEditable || !!t.closest('input, textarea, select, [contenteditable="true"]'));

/** One step of a binding against a key event: "mod+k", "?", "j". */
const matches = (step: string, e: KeyboardEvent) => {
  const parts = step.split('+');
  const key = parts.at(-1)!;
  const mod = parts.includes('mod');
  const shift = parts.includes('shift');
  if (mod !== (MAC ? e.metaKey : e.ctrlKey)) return false;
  if (e.altKey) return false;
  // "?" and other shifted symbols are their own key; only letters care about shift.
  if (/^[a-z]$/.test(key) && shift !== e.shiftKey) return false;
  return e.key.toLowerCase() === key;
};

/** The visible rows of the list being moved through, in page order. */
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[data-nav]')].filter(
    (el) => el.offsetParent !== null && !el.closest('[inert], [aria-hidden="true"]'),
  );

function move(by: 1 | -1) {
  const all = rows();
  if (!all.length) return;
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next =
    all[at < 0 ? (by > 0 ? 0 : all.length - 1) : Math.min(all.length - 1, Math.max(0, at + by))];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
}

/** The page's keys: every binding, plus list movement. The shell calls it once with all commands. */
export function useKeys(bindings: Binding[]) {
  const current = useRef(bindings);
  current.current = bindings;
  useEffect(() => {
    let pending: { step: string; at: number } | null = null;
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const inText = typing(e.target);
      const onRow = (document.activeElement as HTMLElement | null)?.hasAttribute('data-nav');
      if (!(inText || e.metaKey || e.ctrlKey || e.altKey)) {
        if (e.key === 'j' || (onRow && e.key === 'ArrowDown')) {
          e.preventDefault();
          return move(1);
        }
        if (e.key === 'k' || (onRow && e.key === 'ArrowUp')) {
          e.preventDefault();
          return move(-1);
        }
        if (onRow && e.key === 'Escape') {
          (document.activeElement as HTMLElement).blur();
          return;
        }
      }
      const fresh = pending && Date.now() - pending.at < 1000 ? pending : null;
      pending = null;
      for (const b of current.current) {
        const steps = b.keys.split(' ');
        const modded = steps[0].includes('mod+');
        if (inText && !modded) continue;
        const done =
          steps.length === 1
            ? matches(steps[0], e)
            : !!fresh && fresh.step === steps[0] && matches(steps[1], e);
        if (done) {
          e.preventDefault();
          b.run();
          return;
        }
      }
      // The first key of a sequence ("g"): remembered for the next.
      if (
        !inText &&
        current.current.some(
          (b) => b.keys.split(' ').length > 1 && matches(b.keys.split(' ')[0], e),
        )
      )
        pending = { step: e.key.toLowerCase(), at: Date.now() };
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
}

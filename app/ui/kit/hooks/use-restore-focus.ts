import { useEffect, useRef } from 'react';

// Controlled dialogs have no Radix Trigger. Track focus while closed so opening autofocus cannot
// replace the control we need to return to after Escape, backdrop clicks, or the close button.
export function useRestoreFocus(open: boolean) {
  const trigger = useRef<HTMLElement | null>(null);
  const identity = useRef<{ tag: string; name: string; labelled: boolean } | null>(null);
  useEffect(() => {
    if (open) return;
    const remember = () => {
      if (document.activeElement instanceof HTMLElement) {
        trigger.current = document.activeElement;
        identity.current = {
          tag: trigger.current.tagName.toLowerCase(),
          name: trigger.current.getAttribute('aria-label') ?? trigger.current.textContent ?? '',
          labelled: trigger.current.hasAttribute('aria-label'),
        };
      }
    };
    if (!trigger.current) remember();
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, [open]);
  return (event: Event) => {
    const visible = (node: HTMLElement) => node.isConnected && node.getClientRects().length > 0;
    let target = trigger.current;
    if (!target || !visible(target)) {
      const same = identity.current;
      if (!same || same.tag === 'body') return;
      target =
        [...document.querySelectorAll<HTMLElement>(same.tag)].find(
          (node) =>
            visible(node) &&
            (same.labelled ? node.getAttribute('aria-label') : node.textContent) === same.name,
        ) ?? null;
    }
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
}

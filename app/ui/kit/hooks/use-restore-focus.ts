import { useEffect, useRef } from 'react';
import { usePresentation } from '../presentation.tsx';

// Controlled dialogs have no Radix Trigger. Track focus while closed so opening autofocus cannot
// replace the control we need to return to after Escape, backdrop clicks, or the close button.
// Keep the focus path: a command in a disappearing Search dialog may open another menu, which
// should return to Search's original control when its command no longer exists.
export function useRestoreFocus(open: boolean) {
  const presentation = usePresentation();
  const targets = useRef<{ node: HTMLElement; tag: string; name: string; labelled: boolean }[]>([]);
  useEffect(() => {
    if (open) return;
    const remember = () => {
      if (document.activeElement instanceof HTMLElement) {
        const node = document.activeElement;
        if (presentation && !presentation.portal.contains(node)) return;
        targets.current = [
          {
            node,
            tag: node.tagName.toLowerCase(),
            name: node.getAttribute('aria-label') ?? node.textContent ?? '',
            labelled: node.hasAttribute('aria-label'),
          },
          ...targets.current.filter((target) => target.node !== node),
        ].slice(0, 10);
      }
    };
    if (!targets.current.length) remember();
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, [open, presentation]);
  return (event: Event) => {
    const visible = (node: HTMLElement) => node.isConnected && node.getClientRects().length > 0;
    for (const same of targets.current) {
      if (same.tag === 'body') continue;
      const target = visible(same.node)
        ? same.node
        : [...(presentation?.portal ?? document).querySelectorAll<HTMLElement>(same.tag)].find(
            (node) =>
              visible(node) &&
              (same.labelled ? node.getAttribute('aria-label') : node.textContent) === same.name,
          );
      if (!target) continue;
      event.preventDefault();
      target.focus();
      return;
    }
  };
}

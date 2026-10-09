import { usePresentationFocus } from '../presentation-policy.tsx';

// Compatibility for compositions while library adapters migrate to finalFocus.
export function useRestoreFocus(open: boolean) {
  const restore = usePresentationFocus(open);
  return (event: Event) => {
    const target = restore();
    if (!target) return;
    event.preventDefault();
    target.focus();
  };
}

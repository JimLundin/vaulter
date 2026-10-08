import { usePresentation } from '../presentation.tsx';

// Each example owns its overlays. Clicking another example must not dismiss this one's open state.
export function usePreviewInteraction<E extends Event>(handler?: (event: E) => void) {
  const presentation = usePresentation();
  return (event: E) => {
    const outside =
      'detail' in event
        ? (event.detail as { originalEvent?: Event }).originalEvent?.target
        : event.target;
    if (presentation && outside instanceof Node && !presentation.portal.contains(outside)) {
      event.preventDefault();
      return;
    }
    handler?.(event);
  };
}

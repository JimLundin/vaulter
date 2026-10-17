import { useEffect } from 'react';
import { usePresentation } from '@/ui/kit/presentation.tsx';

// Mobile keyboards resize the visual viewport, which can be smaller than 100dvh. Keep the composer
// and app controls in that space, including browsers that pan while an input has focus.
export function useViewport() {
  const presentation = usePresentation();
  useEffect(() => {
    if (presentation) return;
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty('--viewport-height', `${viewport.height}px`);
      root.style.setProperty('--viewport-top', `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      root.style.removeProperty('--viewport-height');
      root.style.removeProperty('--viewport-top');
    };
  }, [presentation]);
}

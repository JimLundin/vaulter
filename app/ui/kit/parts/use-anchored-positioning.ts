// Base UI intersects collisionBoundary with the browser viewport. Compensate that intersection
// for bounded canvases so its own flip, shift and size mechanics use the entire local canvas.
import { useLayoutEffect, useState } from 'react';
import { usePresentationPolicy } from '../presentation-policy.tsx';

export function useAnchoredPositioning() {
  const policy = usePresentationPolicy();
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    const measure = () => setBounds(policy.bounds());
    measure();
    return policy.watchBounds(measure);
  }, [policy]);
  if (!policy.bounded || !bounds) return policy.positioning;
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? innerWidth);
  const bottom = top + (viewport?.height ?? innerHeight);
  return {
    ...policy.positioning,
    collisionPadding: {
      left: 5 + Math.min(0, bounds.left - left),
      top: 5 + Math.min(0, bounds.top - top),
      right: 5 + Math.min(0, right - bounds.right),
      bottom: 5 + Math.min(0, bottom - bounds.bottom),
    },
  };
}

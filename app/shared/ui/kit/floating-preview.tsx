// Preview chrome moves independently of the app and stays inside its visible frame.
import { type ReactNode, useCallback, useLayoutEffect, useRef } from 'react';

export function FloatingPreview({ children }: { children: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLFieldSetElement>(null);
  const position = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{
    id: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const place = useCallback(() => {
    const outer = frame.current;
    const inner = pill.current;
    if (!(outer && inner)) return;
    const maxX = Math.max(0, outer.clientWidth - inner.offsetWidth);
    const maxY = Math.max(0, outer.clientHeight - inner.offsetHeight);
    const next = {
      x: Math.max(0, Math.min(position.current?.x ?? maxX / 2, maxX)),
      y: Math.max(0, Math.min(position.current?.y ?? 0, maxY)),
    };
    if (position.current) position.current = next;
    inner.style.left = `${next.x}px`;
    inner.style.top = `${next.y}px`;
  }, []);
  useLayoutEffect(() => {
    place();
    const observer = new ResizeObserver(place);
    if (frame.current) observer.observe(frame.current);
    if (pill.current) observer.observe(pill.current);
    return () => observer.disconnect();
  }, [place]);
  return (
    <div
      ref={frame}
      className="pointer-events-none absolute inset-2 top-[max(8px,env(safe-area-inset-top))] bottom-[max(8px,env(safe-area-inset-bottom))] z-[60]"
    >
      <fieldset
        ref={pill}
        aria-label="Floating preview controls"
        className="absolute m-0 w-max min-w-0 max-w-full border-0 p-0"
        onPointerDown={(event) => {
          if (event.button !== 0 || !event.isPrimary || drag.current) return;
          suppressClick.current = false;
          if (
            !(event.target instanceof Element && event.target.closest('[data-preview-drag-handle]'))
          )
            return;
          const bounds = event.currentTarget.getBoundingClientRect();
          const outer = frame.current!.getBoundingClientRect();
          drag.current = {
            id: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: bounds.left - outer.left,
            y: bounds.top - outer.top,
            moved: false,
          };
          event.target.closest('[data-preview-drag-handle]')!.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.startX;
          const dy = event.clientY - current.startY;
          if (!current.moved && Math.hypot(dx, dy) < 5) return;
          current.moved = true;
          suppressClick.current = true;
          event.currentTarget.setAttribute('data-dragging', '');
          position.current = { x: current.x + dx, y: current.y + dy };
          place();
        }}
        onLostPointerCapture={(event) => {
          if (drag.current?.id !== event.pointerId) return;
          drag.current = null;
          event.currentTarget.removeAttribute('data-dragging');
        }}
        onClickCapture={(event) => {
          if (!(suppressClick.current && event.detail)) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (
            !(event.target instanceof Element && event.target.closest('[data-preview-drag-handle]'))
          )
            return;
          const step = event.shiftKey ? 40 : 10;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          if (event.key === 'Home') position.current = null;
          else if (moves[event.key]) {
            const bounds = event.currentTarget.getBoundingClientRect();
            const outer = frame.current!.getBoundingClientRect();
            const [dx, dy] = moves[event.key];
            position.current = { x: bounds.left - outer.left + dx, y: bounds.top - outer.top + dy };
          } else return;
          event.preventDefault();
          event.stopPropagation();
          place();
        }}
      >
        {children}
      </fieldset>
    </div>
  );
}

// Generic surfaces and behavior primitives. Compositions own content; these own presentation.
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';
import { Button } from './parts/button.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';
import type { Unstyled } from './lib/unstyled.tsx';
import { cn } from './lib/utils.ts';
import { useLayout } from './hooks/use-layout.ts';
import { SupportingDrawer } from './drawer.tsx';
import { useFieldSemanticDiagnostic } from './field-association.ts';

const surfaces = {
  plain: '',
  bubble:
    'max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3 py-2.5 text-body text-copy md:px-4 md:py-3',
  inset:
    'gap-[var(--space-content)] border-y bg-background px-[var(--page-inset)] py-4 md:border-0 md:p-0',
  groupHeading: 'px-[var(--page-inset)] md:px-0',
  grouped: 'gap-[var(--space-row)] md:gap-[var(--space-content)] md:border-t md:pt-6',
  preferences: 'gap-[var(--space-section)] bg-surface py-4 md:bg-background md:px-6',
  emblem: 'size-10 items-center justify-center rounded-full bg-muted text-muted-foreground',
};
/** Bordered, inset and grouped surfaces reuse the same responsive roles. */
export function Surface({
  variant = 'plain',
  as: As = 'div',
  ...props
}: Unstyled<React.HTMLAttributes<HTMLElement>> & {
  variant?: keyof typeof surfaces;
  as?: 'div' | 'section' | 'fieldset';
}) {
  useFieldSemanticDiagnostic(props);
  return (
    <As
      {...props}
      data-surface={variant}
      className={cn('flex min-h-0 min-w-0 flex-col', surfaces[variant])}
    />
  );
}

/** A compact bordered toolbar becomes an open toolbar in expanded space. */
export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-3 py-1 md:min-h-0 md:border-0 md:px-0 md:py-0">
      {children}
    </header>
  );
}

/** Stable flex layout and optional centered reading width for feature content. */
export function ReadingColumn({
  page,
  label,
  children,
}: {
  page?: boolean;
  label?: string;
  children: ReactNode;
}) {
  const mobile = useLayout() === 'compact';
  return (
    <section
      aria-label={label}
      data-layout={mobile ? 'mobile-conversation' : 'desktop-conversation'}
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        page && 'md:px-[var(--page-inset)] md:pt-[var(--page-block)] md:pb-4',
      )}
    >
      <div
        data-reading-column={page ? '' : undefined}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col',
          page && 'mx-auto w-full max-w-[var(--reading-width)]',
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Status grows above the trailing input; compact space supplies an edge-to-edge surface. */
export function Dock({ children, status }: { children: ReactNode; status?: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-surface px-4 py-3 md:border-0 md:bg-transparent md:px-0">
      {status}
      {children}
    </div>
  );
}

/** A status dot or live text cursor, independent of any recording workflow. */
export function StatusMark({ active, cursor }: { active?: boolean; cursor?: boolean }) {
  return (
    <span
      aria-hidden={true}
      className={cn(
        cursor
          ? 'ml-1 inline-block h-5 w-0.5 bg-primary align-middle'
          : 'inline-block size-2 rounded-full',
        !cursor && (active ? 'bg-destructive' : 'bg-subtle-foreground'),
        active && 'animate-pulse',
      )}
    />
  );
}

/** One scroll owner with optional follow-to-end; user scrolling releases the follow lock. */
export function AutoScrollArea({ empty, children }: { empty?: boolean; children: ReactNode }) {
  const follow = useStickToBottom({ initial: 'smooth', resize: 'smooth' });
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <ScrollArea
        fill={true}
        grow={true}
        viewportRef={follow.scrollRef}
        contentRef={follow.contentRef}
      >
        <div
          className={cn(
            'flex flex-1 flex-col gap-4 px-4 py-4 md:gap-6 md:px-1 md:py-7',
            empty && 'min-h-full justify-center md:justify-start',
          )}
        >
          {children}
        </div>
      </ScrollArea>
      {!follow.isAtBottom && (
        <div className="absolute right-3 bottom-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              Promise.resolve(follow.scrollToBottom()).catch(() => undefined);
            }}
          >
            Latest reply
          </Button>
        </div>
      )}
    </div>
  );
}

/** Same content tree: supporting panel, centred dialog, or full-height compact drawer. */
export function AdaptivePanel(props: Parameters<typeof SupportingDrawer>[0]) {
  return <SupportingDrawer {...props} />;
}

/** One horizontal row; fade only the edges with more options outside the viewport. */
export function OptionStrip({ children }: { children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const measure = () => {
      const start = node.scrollLeft > 1;
      const end = node.scrollLeft + node.clientWidth < node.scrollWidth - 1;
      setEdges((current) =>
        current.start === start && current.end === end ? current : { start, end },
      );
    };
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, []);
  return (
    <ScrollArea
      axis="horizontal"
      className="kit-option-strip"
      viewportRef={viewport}
      data-overflow-start={edges.start}
      data-overflow-end={edges.end}
    >
      <div className="flex w-max flex-nowrap gap-[var(--space-row)]">{children}</div>
    </ScrollArea>
  );
}

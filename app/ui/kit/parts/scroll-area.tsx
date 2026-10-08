'use client';

import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';

function ScrollArea({
  className,
  children,
  axis = 'vertical',
  fill = false,
  grow = false,
  viewportRef,
  contentRef,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  axis?: 'vertical' | 'horizontal' | 'both';
  fill?: boolean;
  grow?: boolean;
  viewportRef?: React.Ref<HTMLDivElement>;
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type="auto"
      className={cn(
        'kit-scroll-area relative flex min-h-0 min-w-0 flex-col',
        fill && 'kit-scroll-fill h-full',
        grow && 'flex-1',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        // The follow-to-end library locates wheel scroll owners via computed overflow shorthand.
        // Radix still hides native tracks; auto on both axes identifies this exact viewport.
        style={axis === 'vertical' ? { overflowX: 'auto', overflowY: 'auto' } : undefined}
        data-slot="scroll-area-viewport"
        className="min-h-0 size-full flex-1 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {contentRef ? (
          <div
            ref={contentRef}
            data-slot="scroll-area-content"
            className="flex min-h-full shrink-0 flex-col"
          >
            {children}
          </div>
        ) : (
          children
        )}
      </ScrollAreaPrimitive.Viewport>
      {axis !== 'horizontal' && <ScrollBar />}
      {axis !== 'vertical' && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        'z-10 flex touch-none bg-background/80 p-0.5 transition-colors select-none',
        orientation === 'vertical' && 'h-full w-3',
        orientation === 'horizontal' && 'h-3 flex-col',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-muted-foreground/50 hover:bg-muted-foreground"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };

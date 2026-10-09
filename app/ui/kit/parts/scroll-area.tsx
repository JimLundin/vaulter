'use client';

import * as React from 'react';
import { cn } from '../lib/utils.ts';
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area';

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
        // Base UI hides native tracks; auto on both axes identifies this exact viewport.
        style={
          axis === 'vertical'
            ? { overflowX: 'auto', overflowY: 'auto' }
            : axis === 'horizontal'
              ? { overflowX: 'auto', overflowY: 'hidden' }
              : { overflowX: 'auto', overflowY: 'auto' }
        }
        data-slot="scroll-area-viewport"
        className="min-h-0 size-full flex-1 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        <ScrollAreaPrimitive.Content
          ref={contentRef}
          data-slot="scroll-area-content"
          style={axis === 'vertical' ? { minWidth: 0 } : undefined}
          className={cn('min-h-full', contentRef && 'flex shrink-0 flex-col')}
        >
          {children}
        </ScrollAreaPrimitive.Content>
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
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      data-orientation={orientation}
      className={cn(
        'z-10 flex touch-none bg-background/80 p-0.5 transition-colors select-none',
        orientation === 'vertical' && 'h-full w-3',
        orientation === 'horizontal' && 'h-3 flex-col',
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-muted-foreground/50 hover:bg-muted-foreground"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollBar };

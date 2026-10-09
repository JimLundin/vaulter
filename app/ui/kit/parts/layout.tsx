// Shared layout and typography primitives; independent of app frames and menu surfaces.
import { cva } from 'class-variance-authority';
import type { ComponentProps, ReactNode } from 'react';
import { type Unstyled } from '../lib/unstyled.tsx';
import { cn } from '../lib/utils.ts';

export type Gap = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export const gap = {
  none: 'gap-0',
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-6',
} satisfies Record<Gap, string>;

const align = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
  baseline: 'items-baseline',
} as const;

const justify = {
  start: 'justify-start',
  center: 'justify-center',
  end: 'justify-end',
  between: 'justify-between',
} as const;

interface FlexProps extends Unstyled<ComponentProps<'div'>> {
  gap?: Gap;
  align?: keyof typeof align;
  justify?: keyof typeof justify;
  grow?: boolean;
  fill?: boolean;
  inset?: 'none' | 'sm' | 'md' | 'page';
  block?: 'none' | 'sm' | 'md' | 'lg';
  centerText?: boolean;
  visible?: 'always' | 'compact' | 'expanded';
  as?: 'div' | 'section' | 'header';
}
const inset = { none: '', sm: 'px-2', md: 'px-4', page: 'px-[var(--page-inset)]' };
const block = { none: '', sm: 'py-3', md: 'py-4', lg: 'py-6' };
const visible = { always: '', compact: 'md:hidden', expanded: 'hidden md:flex' };

/** Token-spaced layout; semantic regions and density share the same primitive. */
export function Stack({
  gap: g = 'md',
  align: a = 'stretch',
  justify: j = 'start',
  grow,
  fill,
  inset: i = 'none',
  block: b = 'none',
  centerText,
  visible: v = 'always',
  as: As = 'div',
  ...props
}: FlexProps) {
  return (
    <As
      {...props}
      className={cn(
        'flex min-h-0 min-w-0 flex-col',
        gap[g],
        align[a],
        justify[j],
        inset[i],
        block[b],
        visible[v],
        grow && 'flex-1',
        fill && 'h-full',
        centerText && 'text-center',
      )}
    />
  );
}

/** The same layout tokens, arranged side by side. */
export function Row({
  gap: g = 'sm',
  align: a = 'center',
  justify: j = 'start',
  wrap,
  grow,
  fill,
  inset: i = 'none',
  block: b = 'none',
  centerText,
  visible: v = 'always',
  as: As = 'div',
  ...props
}: FlexProps & { wrap?: boolean }) {
  return (
    <As
      {...props}
      className={cn(
        'flex min-h-0 min-w-0',
        gap[g],
        align[a],
        justify[j],
        inset[i],
        block[b],
        visible[v],
        wrap && 'flex-wrap',
        grow && 'flex-1',
        fill && 'h-full',
        centerText && 'text-center',
      )}
    />
  );
}

/** Pushes what follows it in a Row to the far end. */
export const Spacer = () => <div className="flex-1" />;

const text = cva('m-0', {
  variants: {
    size: {
      xs: 'text-caption',
      sm: 'text-label',
      md: 'text-copy',
      lg: 'text-lead',
      title: 'text-title leading-relaxed tracking-tight',
    },
    tone: {
      default: 'text-foreground',
      muted: 'text-muted-foreground',
      subtle: 'text-subtle-foreground',
      body: 'text-body',
      danger: 'text-destructive',
    },
    weight: { normal: 'font-normal', medium: 'font-medium', semibold: 'font-semibold' },
    mono: { true: 'font-mono' },
    truncate: { true: 'truncate' },
  },
  defaultVariants: { size: 'md', tone: 'default', weight: 'normal' },
});

export interface TextProps extends Unstyled<ComponentProps<'p'>> {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'title';
  align?: 'start' | 'end';
  preserve?: boolean;
  tone?: 'default' | 'muted' | 'subtle' | 'body' | 'danger';
  weight?: 'normal' | 'medium' | 'semibold';
  mono?: boolean;
  truncate?: boolean;
  as?: 'p' | 'span' | 'div';
  children?: ReactNode;
}

export function Text({
  as: As = 'p',
  size,
  tone,
  weight,
  mono,
  truncate,
  align: textAlign,
  preserve,
  ...props
}: TextProps) {
  return (
    <As
      {...props}
      className={cn(
        text({ size, tone, weight, mono, truncate }),
        textAlign === 'end' && 'text-right',
        preserve && 'whitespace-pre-wrap break-words',
      )}
    />
  );
}

const heading = cva('m-0 text-foreground', {
  variants: {
    level: {
      1: '',
      2: 'text-copy font-semibold',
      3: 'text-sm font-medium',
    },
    serif: { true: 'font-serif font-medium', false: '' },
  },
  compoundVariants: [
    { level: 1, serif: true, class: 'text-display' },
    { level: 1, serif: false, class: 'text-title font-semibold' },
  ],
  defaultVariants: { serif: false },
});

/** A page's title (1), a section's (2), a group's (3). Serif for a page of the wiki's kind. */
export function Heading({
  level = 2,
  serif,
  tone,
  size,
  children,
}: {
  size?: 'display' | 'title';
  tone?: 'default' | 'muted' | 'subtle';
  level?: 1 | 2 | 3;
  serif?: boolean;
  children?: ReactNode;
}) {
  const H = `h${level}` as const;
  return (
    <H
      className={cn(
        heading({ level, serif }),
        size === 'title' && 'text-title',
        size === 'display' && 'text-display',
        tone === 'muted' && 'text-muted-foreground',
        tone === 'subtle' && 'text-subtle-foreground',
      )}
    >
      {children}
    </H>
  );
}

/** Long-form text: what Vaulter wrote about a person, a place or an event. */
export function Prose({ children, markdown }: { children?: ReactNode; markdown?: boolean }) {
  return (
    <div className={cn('font-serif text-lead [&_p]:m-0 [&_p+p]:mt-3', markdown && 'prose')}>
      {children}
    </div>
  );
}

/** A link within the app (a hash route) or out of it. */
export function Link({
  href,
  onClick,
  plain,
  className,
  ...props
}: {
  className?: string;
  href?: string;
  onClick?: () => void;
  /** In the text's colour, for lists of things rather than links in prose. */
  plain?: boolean;
  children?: ReactNode;
} & Omit<ComponentProps<'a'>, 'onClick'>) {
  return (
    <a
      {...props}
      href={href ?? '#'}
      onClick={
        onClick &&
        ((e) => {
          e.preventDefault();
          onClick();
        })
      }
      className={cn(
        'no-underline underline-offset-2 hover:underline',
        plain ? 'text-foreground hover:text-muted-foreground' : 'text-link',
        className,
      )}
    />
  );
}

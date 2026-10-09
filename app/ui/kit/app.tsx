// The kit's own pieces, for what shadcn has no component for: layout by the design's spacing, type, the
// tones (people, places, events), panels with their source, the timeline, the mobile action buttons, and
// the frames the shell lays screens out in. Like the rest of the kit, none takes a className or style
// (lib/unstyled.tsx).
import type { ComponentProps, ReactNode } from 'react';
import { Icon, type IconName } from './icons.tsx';
import { type Unstyled, unstyled } from './lib/unstyled.tsx';
import { cn } from './lib/utils.ts';
import { AvatarFallback, Avatar as AvatarPart } from './parts/avatar.tsx';
import { Badge } from './parts/badge.tsx';
import { useIsMobile } from './hooks/use-mobile.ts';
import { useViewport } from './hooks/use-viewport.ts';
import { MenuSheet } from './sheet.tsx';
import { ItemGroup as ItemGroupPart, Item as ItemPart } from './parts/item.tsx';
import { Kbd as KbdPart } from './parts/kbd.tsx';
import { SidebarMenu as SidebarMenuPart, Sidebar as SidebarPart } from './parts/sidebar.tsx';
import { useFieldSemanticDiagnostic } from './field-association.ts';

export type Tone = 'neutral' | 'people' | 'places' | 'events';
import { Link, gap, type Gap } from './parts/layout.tsx';

const chip = {
  neutral: 'bg-muted text-foreground',
  people: 'bg-people-soft text-people-ink',
  places: 'bg-places-soft text-places-ink',
  events: 'bg-events-soft text-events-ink',
} satisfies Record<Tone, string>;

/** A thing by name, in its kind's colour: a person, a place, an event. */
export function Chip({
  tone = 'neutral',
  onClick,
  children,
}: {
  tone?: Tone;
  onClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <Badge
      variant="secondary"
      className={cn(
        'h-auto rounded-full border-0 px-[7px] py-px text-glyph font-medium',
        chip[tone],
        onClick && 'cursor-pointer',
      )}
      asChild={true}
    >
      {onClick ? (
        <button type="button" data-touch-target="" onClick={onClick}>
          {children}
        </button>
      ) : (
        <span>{children}</span>
      )}
    </Badge>
  );
}

const dot = {
  neutral: 'bg-subtle-foreground',
  people: 'bg-people',
  places: 'bg-places',
  events: 'bg-events',
} satisfies Record<Tone, string>;

/** A kind's colour on its own: beside a name in a list. */
export const Dot = ({ tone = 'neutral' }: { tone?: Tone }) => (
  <span aria-hidden={true} className={cn('size-2 shrink-0 rounded-full', dot[tone])} />
);

/** How many: open questions beside "Questions". */
export const Count = ({ n }: { n: number }) => (
  <span className="rounded-full bg-primary px-[7px] text-glyph font-semibold text-primary-foreground">
    {n}
  </span>
);

/** A key to press, as a keycap. */
export function Kbd({ children, large }: { children?: ReactNode; large?: boolean }) {
  return (
    <KbdPart
      className={cn(
        'h-auto rounded-[5px] border border-b-2 border-border bg-background px-[5px] font-mono text-glyph font-normal text-foreground',
        large && 'rounded-md border-key-border border-b-[3px] px-[18px] py-px text-xs',
      )}
    >
      {children}
    </KbdPart>
  );
}

/** A key and what it does: "1–3 Open source". `keys` is one key, or a sequence ("g p"). */
export function KeyHint({
  keys,
  label,
  strong,
}: {
  keys: string;
  label: string;
  strong?: boolean;
}) {
  const parts = keys.split(' ').filter(Boolean);
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 text-xs text-muted-foreground',
        strong && 'gap-2 text-label font-medium text-foreground',
      )}
    >
      {parts.map((k) => (
        <Kbd key={k} large={strong}>
          {k}
        </Kbd>
      ))}
      {label}
    </span>
  );
}

/** Something that needs the person: a question about this page, new access to approve. */
export function Notice({
  title,
  action,
  onClick,
  children,
}: {
  title?: ReactNode;
  /** At the end: a key hint, a chevron. */
  action?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className="flex min-w-[min(16rem,100%)] flex-1 flex-col gap-0.5 text-sm md:flex-row md:flex-wrap md:items-baseline md:gap-x-3">
        {title ? <span className="font-medium">{title}</span> : null}
        {children ? <span className="text-body text-label">{children}</span> : null}
      </div>
      {action}
    </>
  );
  const box =
    'flex w-full flex-wrap items-center gap-3 rounded-2xl border border-notice-border bg-notice px-3.5 py-3 text-left text-foreground md:py-2.5';
  return onClick ? (
    <button
      data-touch-target=""
      type="button"
      onClick={onClick}
      className={cn(box, 'cursor-pointer font-[inherit]')}
    >
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** What an extension contributes to another's screen, labelled with the extension it came from, so it
 * is always clear what turning that extension off would remove. */
export function Panel({
  title,
  from,
  notice,
  children,
}: {
  title?: ReactNode;
  /** The contributing extension's name ("Map"): set by the shell, not by the extension. */
  from: string;
  /** Asks something of the person (a question): the notice colours. */
  notice?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-xl border bg-card',
        notice && 'border-notice-border bg-notice',
      )}
    >
      <div className="flex flex-col gap-2 px-3 py-2.5">
        {title ? <h3 className="m-0 text-sm font-medium">{title}</h3> : null}
        {children}
      </div>
      <SourceLabel from={from} notice={notice} />
    </section>
  );
}

export const SourceLabel = ({ from, notice }: { from: string; notice?: boolean }) => (
  <div
    className={cn(
      'border-t px-3 py-1.5 text-caption text-muted-foreground',
      notice ? 'border-notice-border text-notice-ink' : 'bg-surface',
    )}
  >
    From {from}
  </div>
);

/** Labels and values: a page's fields, an extension's details. */
export function Details({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="m-0 grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-xl border bg-surface p-4 text-label">
      {items.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="m-0">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Things in time order: the day, a page's history. */
export function Timeline({ children }: { children?: ReactNode }) {
  return (
    <ol className="m-0 grid list-none grid-cols-[44px_16px_minmax(0,1fr)] gap-x-2.5 p-0">
      {children}
    </ol>
  );
}

export function TimelineItem({
  time,
  now,
  last,
  children,
}: {
  time: string;
  /** The present moment: an open ring, no line after it. */
  now?: boolean;
  last?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className="contents">
      <span
        className={cn(
          'pt-0.5 text-xs text-muted-foreground',
          now && 'font-semibold text-foreground',
        )}
      >
        {time}
      </span>
      <span className="flex flex-col items-center">
        {now ? (
          <span className="mt-[5px] size-3 rounded-full border-[3px] border-primary" />
        ) : (
          <span className="mt-1.5 size-2.5 rounded-full bg-places" />
        )}
        {!(now || last) && <span className="w-0.5 flex-1 bg-border" />}
      </span>
      <div className={cn('flex min-w-0 flex-col gap-2', !(now || last) && 'pb-[18px]')}>
        {children}
      </div>
    </li>
  );
}

/** Icon-only mobile actions. Only the primary AI action uses a circle; current or open controls have a tint.
 * With `href` it is a link (an action that is also a screen), otherwise a button. */
export function MobileActionButton({
  icon,
  label,
  primary,
  current,
  href,
  expanded,
  onClick,
  onPointerDown,
  onPointerUp,
}: {
  icon: IconName;
  label: string;
  primary?: boolean;
  /** This control leads to the screen being shown. */
  current?: boolean;
  href?: string;
  expanded?: boolean;
  onClick?: () => void;
  onPointerDown?: () => void;
  onPointerUp?: () => void;
}) {
  const className = cn(
    'flex size-11 cursor-pointer items-center justify-center border-0 p-0 text-foreground focus-visible:outline-2 focus-visible:outline-ring',
    primary
      ? 'rounded-full bg-primary text-primary-foreground'
      : 'rounded-md bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
    !primary && (current || expanded) && 'bg-muted text-foreground',
  );
  if (href)
    return (
      <a
        href={href}
        aria-label={label}
        aria-current={current ? 'page' : undefined}
        onClick={onClick}
        className={className}
      >
        <Icon name={icon} size="lg" />
      </a>
    );
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      aria-label={label}
      aria-expanded={expanded}
      aria-current={current ? 'page' : undefined}
      className={className}
    >
      <Icon name={icon} size="lg" />
    </button>
  );
}

/** The app's mark and name, at the top of the sidebar. */
export const Brand = ({ status }: { status?: ReactNode }) => (
  <div className="flex items-center gap-2.5 px-1.5">
    <div className="flex size-[30px] items-center justify-center rounded-[9px] bg-primary text-sm font-semibold text-primary-foreground">
      V
    </div>
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="text-base font-semibold">Vaulter</div>
      {status}
    </div>
  </div>
);

/** A screen's content, with the design's margins; `aside` is a column beside it on desktop and under it
 * on mobile (a page's fields, its links). */
export function Page({ aside, children }: { aside?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex w-full flex-col justify-center gap-8 px-[var(--page-inset)] py-[var(--page-block)] md:flex-row md:gap-12">
      <article
        data-reading-column=""
        className="mx-auto flex w-full min-w-0 flex-1 flex-col gap-4 md:mx-0 md:max-w-[var(--reading-width)]"
      >
        {children}
      </article>
      {aside ? <aside className="flex shrink-0 flex-col gap-5 md:w-[260px]">{aside}</aside> : null}
    </div>
  );
}

/** Feature screens share a centered reading column; compact space uses its full width. */
export function FeaturePage({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="w-full md:px-[var(--page-inset)] md:py-[var(--page-block)]">
      <div
        data-reading-column=""
        className="mx-auto flex w-full max-w-[var(--reading-width)] flex-col md:gap-6"
      >
        <PageHeader title={title} description={description} actions={actions} />
        {children}
      </div>
    </article>
  );
}

/** A screen's title, what it holds, and its actions. One component, two placements: on a phone a
 * bordered strip above full-width content, on desktop the top of the reading column. The type roles
 * and the copy are the same on both; only the placement differs. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const mobile = useIsMobile();
  return (
    <header
      data-variant={mobile ? 'mobile' : 'desktop'}
      className={cn(
        'flex items-start justify-between gap-4',
        mobile && 'border-b bg-background px-[var(--page-inset)] py-[var(--page-block)]',
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="m-0 text-title font-semibold">{title}</h1>
        {description ? <p className="m-0 text-copy text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** Keeps routed workflow state mounted when the viewport changes. */
export function WorkspaceFrame({
  header,
  bar,
  children,
}: {
  header: ReactNode;
  bar: ReactNode;
  children: ReactNode;
}) {
  const mobile = useIsMobile();
  useViewport();
  return (
    <div
      data-layout={mobile ? 'mobile-workspace' : 'desktop-workspace'}
      className="flex h-[var(--viewport-height,100dvh)] min-w-0 flex-1 flex-col bg-background"
    >
      {mobile && header}
      <main data-region="" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      {mobile && bar}
    </div>
  );
}

export function MobileHeader({ status }: { status: ReactNode }) {
  return (
    <header
      data-brand=""
      className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b px-4 pt-[env(safe-area-inset-top)]"
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
          V
        </span>
        Vaulter
      </span>
      <div className="min-w-0 truncate">{status}</div>
    </header>
  );
}

/** Phone navigation has touch rows in a bottom sheet rather than a desktop sidebar. */
export function NavigationSheet({
  open,
  onClose,
  brand,
  entries,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  brand: ReactNode;
  entries: { href: string; label: string; icon: IconName; active: boolean }[];
  footer?: ReactNode;
}) {
  return (
    <MenuSheet open={open} onClose={onClose} title="Menu" header={brand}>
      <nav
        aria-label="Main navigation"
        className="flex min-h-0 flex-col overflow-y-auto border-y px-2 py-2"
      >
        {entries.map((entry) => (
          <a
            key={entry.href}
            href={entry.href}
            aria-current={entry.active ? 'page' : undefined}
            onClick={onClose}
            className={cn(
              'flex min-h-14 items-center gap-3 rounded-md px-4 text-copy hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
              entry.active && 'bg-muted font-medium',
            )}
          >
            <Icon name={entry.icon} size="lg" />
            <span className="flex-1">{entry.label}</span>
            <Icon name="chevron-right" size="sm" />
          </a>
        ))}
      </nav>
      {!!footer && <div className="flex flex-col px-4 pt-3">{footer}</div>}
    </MenuSheet>
  );
}

/** The mobile frame: the screen, the notices above the controls, the controls. */
export function MobileFrame({
  notices,
  bar,
  children,
}: {
  notices?: ReactNode;
  bar: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-background">
      <main data-region="" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
      {notices ? <div className="flex flex-col gap-2 px-4 pb-2.5">{notices}</div> : null}
      {bar}
    </div>
  );
}

/** Footer navigation and an independent circular agent control floating above it. Either three
 * fixed places (`left`, `center`, `right`) or `items` spread evenly across the bar. */
export function MobileBar({
  left,
  center,
  right,
  items,
  floating,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
  items?: ReactNode[];
  floating?: ReactNode;
}) {
  return (
    <footer
      className={cn(
        'relative shrink-0 border-t border-muted px-5 pt-1.5 pb-[max(6px,env(safe-area-inset-bottom))]',
        items ? 'flex items-center justify-between' : 'grid grid-cols-3 items-center',
      )}
    >
      {items ?? (
        <>
          <div className="justify-self-start">{left}</div>
          <div className="justify-self-center">{center}</div>
          <div className="justify-self-end">{right}</div>
        </>
      )}
      {!!floating && (
        <div data-floating-agent="" className="absolute right-5 bottom-[calc(100%+12px)] z-20">
          {floating}
        </div>
      )}
    </footer>
  );
}

/** The desktop content beside the sidebar. */
export function DesktopMain({ children }: { children?: ReactNode }) {
  return (
    <div className="flex h-svh min-w-0 flex-1 flex-col">
      <main data-region="" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

/** The sidebar's search field: a button that opens search, with its key. */
export function SearchButton({
  label,
  name = label,
  keys,
  onClick,
}: {
  label: string;
  name?: string;
  keys?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-touch-target=""
      aria-label={name}
      className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-lg border bg-background pr-2 pl-3 text-left font-[inherit] text-sm text-muted-foreground"
    >
      <Icon name="search" size="sm" />
      {label}
      {keys ? (
        <span className="ml-auto">
          <Kbd>{keys}</Kbd>
        </span>
      ) : null}
    </button>
  );
}

/** The desktop sidebar: the full height of the window, with the design's border. */
export function Sidebar(props: Unstyled<ComponentProps<typeof SidebarPart>>) {
  useFieldSemanticDiagnostic(props);
  return (
    <SidebarPart {...props} data-region="nav" className="h-svh border-r bg-sidebar px-1 py-2" />
  );
}

/** The sidebar's list: moved through with the arrow keys, as every list is. */
export function SidebarMenu(props: Unstyled<ComponentProps<typeof SidebarMenuPart>>) {
  useFieldSemanticDiagnostic(props);
  return <SidebarMenuPart {...props} data-arrows="" />;
}

// Whole class names, so Tailwind finds them.
const columns = { 2: 'grid-cols-2', 3: 'grid-cols-3' } as const;
const stacked = { 2: 'grid-cols-1 md:grid-cols-2', 3: 'grid-cols-1 md:grid-cols-3' } as const;

/** Equal columns: answers side by side, before and after. `stack` puts them one under another on
 * mobile. */
export function Columns({
  count = 2,
  gap: g = 'md',
  stack,
  children,
}: {
  count?: 2 | 3;
  gap?: Gap;
  stack?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0', stack ? stacked[count] : columns[count], gap[g])}>
      {children}
    </div>
  );
}

/** A list and the one chosen from it, side by side (an inbox). On mobile only one of them shows:
 * the detail when there is one, else the list. */
export function ListDetail({
  list,
  detail,
}: {
  list: ReactNode;
  /** Nothing chosen: the list alone on mobile, an empty detail on desktop. */
  detail?: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0">
      <div
        data-region=""
        className={cn(
          'flex min-h-0 w-full flex-col overflow-y-auto md:w-[380px] md:shrink-0 md:border-r',
          detail ? 'max-md:hidden' : '',
        )}
      >
        {list}
      </div>
      <div
        data-region=""
        className={cn('min-h-0 min-w-0 flex-1 overflow-y-auto', detail ? '' : 'max-md:hidden')}
      >
        {detail}
      </div>
    </div>
  );
}

const mark = {
  neutral: 'bg-muted',
  people: 'bg-people-soft text-people-ink',
  places: 'bg-places-soft text-places-ink',
  events: 'bg-events-soft text-events-ink',
} satisfies Record<Tone, string>;

/** A word in a quote or a transcript, in its kind's colour: who or what it is about. */
export function Mark({
  tone = 'neutral',
  unsure,
  children,
}: {
  tone?: Tone;
  /** Not settled yet ("Which Anna?"): underlined, without the colour. */
  unsure?: boolean;
  children?: ReactNode;
}) {
  return (
    <mark
      className={cn(
        'rounded-[4px] px-0.5 text-inherit',
        unsure
          ? 'bg-transparent underline decoration-2 underline-offset-4 decoration-muted-foreground'
          : mark[tone],
      )}
    >
      {children}
    </mark>
  );
}

/** A fact's sources, as footnote numbers: 1, or 2,3. */
export function Cite({ n, onClick }: { n: number[]; onClick?: (n: number) => void }) {
  return (
    <sup className="font-sans text-glyph text-link">
      {n.map((x, i) => (
        <span key={x}>
          {i > 0 ? ',' : null}
          {onClick ? (
            <button
              type="button"
              onClick={() => onClick(x)}
              className="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-link"
            >
              {x}
            </button>
          ) : (
            x
          )}
        </span>
      ))}
    </sup>
  );
}

/** Where what is said came from, numbered as the footnotes are. */
export function Sources({
  items,
}: {
  items: { id: string; label: ReactNode; meta?: ReactNode; onClick?: () => void }[];
}) {
  return (
    <ol className="m-0 flex list-decimal flex-col gap-0.5 pl-5 text-label text-body">
      {items.map((s) => (
        <li key={s.id}>
          {s.onClick ? <Link onClick={s.onClick}>{s.label}</Link> : s.label}
          {s.meta ? <span className="text-muted-foreground"> · {s.meta}</span> : null}
        </li>
      ))}
    </ol>
  );
}

const marker = {
  dot: 'list-disc',
  number: 'list-decimal',
  plus: "list-['+_'] marker:text-places",
} as const;

/** Items in a list: what an extension adds, steps. */
export function List({
  marker: m = 'dot',
  children,
}: {
  marker?: keyof typeof marker;
  children?: ReactNode;
}) {
  return <ul className={cn('m-0 flex flex-col gap-1 pl-5 text-sm', marker[m])}>{children}</ul>;
}

export const ListItem = ({ children }: { children?: ReactNode }) => <li>{children}</li>;

const avatar = {
  neutral: 'bg-muted text-foreground',
  people: 'bg-people-soft text-people-ink',
  places: 'bg-places-soft text-places-ink',
  events: 'bg-events-soft text-events-ink',
} satisfies Record<Tone, string>;

/** Someone or something by its initials: "Anna Berg" → AB. */
export function Avatar({ name, tone = 'people' }: { name: string; tone?: Tone }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  return (
    <AvatarPart className="size-9">
      <AvatarFallback className={cn('text-label font-semibold', avatar[tone])}>
        {initials}
      </AvatarFallback>
    </AvatarPart>
  );
}

/** That something is recording, and for how long. */
export function Recording({ seconds, label = 'Recording' }: { seconds: number; label?: string }) {
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, '0');
  return (
    <span className="flex items-center gap-2 text-label font-medium text-destructive">
      <span className="size-2 animate-pulse rounded-full bg-destructive" />
      {label} · {m}:{s}
    </span>
  );
}

/** A row in a list; as a button or a link (asChild) too, reading from the left. `current` marks the
 * one shown now, where the arrow keys start from. */
export function Item({
  current,
  ...props
}: Unstyled<ComponentProps<typeof ItemPart>> & { current?: boolean }) {
  useFieldSemanticDiagnostic(props);
  return (
    <ItemPart
      {...props}
      variant={current ? 'muted' : props.variant}
      aria-current={current ? 'true' : undefined}
      className="w-full text-left"
    />
  );
}

/** Rows one under another, moved through with the arrow keys. */
export function ItemGroup(props: Unstyled<ComponentProps<typeof ItemGroupPart>>) {
  useFieldSemanticDiagnostic(props);
  return <ItemGroupPart {...props} data-arrows="" />;
}

export interface Choice {
  id: string;
  label: string;
}

/** The answers to a question. `list`: one under another, at a readable width, each with its number
 * key when `numbered` (the inbox); `inline`: side by side, compact (a notice on a page). Moved
 * through with the arrow keys. `onChoose` gets the event first, so `kernel.asPerson` can wrap it. */
export function Choices({
  choices,
  onChoose,
  suggested,
  numbered,
  layout = 'list',
}: {
  choices: Choice[];
  onChoose: (event: { isTrusted?: boolean } | undefined, choice: string) => void;
  /** Vaulter's guess: outlined. */
  suggested?: string;
  numbered?: boolean;
  layout?: 'list' | 'inline';
}) {
  if (layout === 'inline')
    return (
      <div data-arrows="" className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <button
            key={c.id}
            type="button"
            data-touch-target=""
            onClick={(e) => onChoose(e, c.id)}
            className={cn(
              'h-8 cursor-pointer rounded-md border bg-background px-3 font-[inherit] text-label font-medium text-foreground outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
              suggested === c.id && 'border-foreground',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  return (
    <div data-arrows="" className="flex w-full max-w-md flex-col gap-1.5">
      {choices.map((c, i) => (
        <button
          data-touch-target=""
          key={c.id}
          type="button"
          onClick={(e) => onChoose(e, c.id)}
          className={cn(
            'flex cursor-pointer items-center gap-3 rounded-lg border bg-background px-3.5 py-3 text-left font-[inherit] text-sm text-foreground outline-none hover:bg-accent focus-visible:border-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50',
            suggested === c.id && 'border-foreground',
          )}
        >
          {numbered && i < 9 ? <Kbd>{String(i + 1)}</Kbd> : null}
          {c.label}
        </button>
      ))}
    </div>
  );
}

/** A semantic form: behavior stays with its caller, presentation stays in the kit. */
export const Form = unstyled(
  ({
    layout = 'default',
    ...props
  }: ComponentProps<'form'> & { layout?: 'default' | 'inline' }) => (
    <form
      {...props}
      className={layout === 'inline' ? 'flex min-w-0 w-full items-center' : undefined}
    />
  ),
);

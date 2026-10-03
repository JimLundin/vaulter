// The structure every view is built from, so they read alike: a page header (the kind badge, the title,
// the lede), sections (a title, a count, a link), label | content lists, and the loading, empty and
// error states. Views compose these with the ui/ components; they don't restyle them.
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';

export function PageHeader({
  kind,
  meta,
  title,
  lede,
  actions,
  className,
}: {
  /** What the page is ("map", "person"), as a badge above the title. */
  kind?: ReactNode;
  /** More above the title, after the kind: facets, dates. */
  meta?: ReactNode;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {(!!kind || !!meta) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-faint">
          {!!kind && <Badge variant="secondary">{kind}</Badge>}
          {meta}
        </div>
      )}
      <div className="flex items-start justify-between gap-4">
        <h1 className="m-0 text-3xl font-bold leading-tight tracking-tight">{title}</h1>
        {!!actions && <div className="flex shrink-0 items-center gap-2 pt-1">{actions}</div>}
      </div>
      {!!lede && <div className="mt-2 text-muted-foreground [&_p]:m-0">{lede}</div>}
    </header>
  );
}

export function Section({
  title,
  count,
  action,
  children,
  className,
  id,
}: {
  title: ReactNode;
  count?: number | string;
  /** A link at the right of the title ("Calendar →"). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('mt-10 first:mt-0', className)}>
      <div className="mb-3 flex items-baseline justify-between gap-4 border-b pb-1.5">
        <h2 className="m-0 text-lg font-semibold">
          {title}
          {count !== undefined && (
            <span className="ml-2 text-sm font-normal text-faint tabular-nums">{count}</span>
          )}
        </h2>
        {!!action && <div className="text-sm [&_a]:no-underline">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** The small uppercase label over a group or beside a value. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('text-xs font-semibold uppercase tracking-wider text-faint', className)}>
      {children}
    </span>
  );
}

/** Label | content rows, one label width everywhere; stacked on narrow screens. */
export function FieldList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        'm-0 grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2 max-sm:grid-cols-1 max-sm:gap-y-0.5',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <>
      <dt className="pt-0.5 max-sm:mt-2">
        <Eyebrow>{label}</Eyebrow>
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  );
}

export function Loading({ children = 'Loading…' }: { children?: ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-faint" aria-live="polite">
      <span className="size-1.5 animate-pulse rounded-full bg-faint" />
      {children}
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground italic">{children}</p>;
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

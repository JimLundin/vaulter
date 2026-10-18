import { useId, type ReactNode } from 'react';

export interface TimelineItem {
  id: string;
  date: string;
  title: string;
  metadata?: ReactNode;
  description?: ReactNode;
  details?: ReactNode;
}

/** Ordered, accessible chronology; callers supply dates and all record meaning. */
export function Timeline({
  items,
  label = 'Timeline',
  empty = 'No entries in this timeline.',
}: {
  items: readonly TimelineItem[];
  label?: string;
  empty?: string;
}) {
  const heading = useId();
  return (
    <section aria-labelledby={heading} className="min-w-0">
      <h2 id={heading} className="mb-4 font-serif text-xl tracking-tight">
        {label}
      </h2>
      {items.length ? (
        <ol className="m-0 list-none p-0">
          {items.map((item) => (
            <li key={item.id} className="relative border-l border-border pb-6 pl-6 last:pb-0">
              <span
                aria-hidden="true"
                className="absolute -left-[5px] top-2 size-[9px] rounded-full border-2 border-background bg-primary"
              />
              <p className="mb-1 text-caption text-muted-foreground">{item.date}</p>
              <h3 className="break-words text-copy font-medium">{item.title}</h3>
              {item.metadata && (
                <div className="mt-1 flex flex-wrap gap-2 text-caption text-muted-foreground">
                  {item.metadata}
                </div>
              )}
              {item.description && (
                <div className="mt-2 text-copy text-body">{item.description}</div>
              )}
              {item.details && (
                <details className="mt-2 text-label">
                  <summary className="min-h-11 cursor-pointer content-center text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
                    Details for {item.title}
                  </summary>
                  <div className="pt-2">{item.details}</div>
                </details>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-copy text-muted-foreground">{empty}</p>
      )}
    </section>
  );
}

export interface MonthDay {
  date: string;
  label: string;
  number: number;
  items: readonly { id: string; title: string }[];
}

/** A controlled month navigator; date calculations and record selection belong to the owner. */
export function MonthCalendar({
  label,
  offset,
  days,
  selected,
  onSelect,
  fit = false,
}: {
  label: string;
  offset: number;
  days: readonly MonthDay[];
  selected?: string;
  onSelect: (date: string) => void;
  /** Fill the available height with equal week rows; the parent supplies a bounded flex layout. */
  fit?: boolean;
}) {
  const weeks = Math.ceil((offset + days.length) / 7);
  return (
    <section
      aria-label={label}
      className={`overflow-hidden rounded-lg border bg-background ${fit ? 'flex min-h-0 flex-1 flex-col' : ''}`}
    >
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/30" aria-hidden="true">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
          <span key={day} className="py-3 text-center text-caption text-muted-foreground">
            {day}
          </span>
        ))}
      </div>
      <div
        className={`grid grid-cols-7 ${fit ? 'min-h-0 flex-1 auto-rows-fr' : ''}`}
        style={fit ? { gridTemplateRows: `repeat(${weeks}, minmax(44px, 1fr))` } : undefined}
      >
        {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
          .slice(0, offset)
          .map((weekday) => (
            <div key={weekday} aria-hidden="true" className="border-b border-r bg-muted/10" />
          ))}
        {days.map((day) => (
          <button
            key={day.date}
            type="button"
            aria-label={`${day.label}${day.items.length ? `, ${day.items.length} entries: ${day.items.map((item) => item.title).join(', ')}` : ', no entries'}`}
            aria-pressed={selected === day.date}
            onClick={() => onSelect(day.date)}
            className={`flex min-w-0 flex-col gap-1 overflow-hidden border-b border-r p-2 text-left last:border-r-0 hover:bg-muted/40 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ring ${fit ? 'min-h-11' : 'min-h-20 md:min-h-28'} ${selected === day.date ? 'bg-primary/10' : ''}`}
          >
            <span
              className={`flex size-7 shrink-0 items-center justify-center rounded-full text-label ${selected === day.date ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {day.number}
            </span>
            <span className="flex flex-wrap gap-1 md:hidden">
              {day.items.slice(0, 3).map((item) => (
                <span
                  key={item.id}
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-primary"
                />
              ))}
            </span>
            <span className="hidden min-w-0 flex-col gap-1 md:flex">
              {day.items.slice(0, 2).map((item) => (
                <span key={item.id} className="truncate rounded bg-primary/10 px-1 text-caption">
                  {item.title}
                </span>
              ))}
              {day.items.length > 2 && (
                <span className="text-caption text-muted-foreground">
                  +{day.items.length - 2} more
                </span>
              )}
            </span>
          </button>
        ))}
        {!!fit &&
          ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
            .slice((offset + days.length) % 7 || 7)
            .map((weekday) => (
              <div
                key={`trailing-${weekday}`}
                aria-hidden="true"
                className="border-b border-r bg-muted/10"
              />
            ))}
      </div>
    </section>
  );
}

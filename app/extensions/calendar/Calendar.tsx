// Every dated entry (the `dates` field, conventions §3): upcoming first, then the past newest first.
// Yearly entries repeat. A day with a daily note links to it.
import type { Note } from '../../../core/note-fields.ts';
import { hrefOf, titleOf, kind } from '../../../core/note-fields.ts';
import { datesOf } from '../../../core/facts.ts';
import { fmtDay, lastDay, monthName, today, weekdayDay } from '../../../core/format.ts';
import { occurrences, type Occurrence } from './dates.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { cn } from 'cn';
import { Field, FieldList, PageHeader, Section } from '@/components/layout.tsx';

const lnk = 'text-primary no-underline hover:underline';
/** A row's link that j/k stop at: highlighted when focused. */
const navRow = '-mx-1 px-1 data-[nav]:focus-visible:bg-accent data-[nav]:focus-visible:outline-2';
/** A date as a Field label: the label's colour, not its uppercase. */
const code = 'rounded-sm bg-surface px-1 font-mono text-sm';

// An entry is upcoming if it (or its end) is today or later; a month or year counts until it is over.
const last = (o: Occurrence) => lastDay(o.end || o.date);
const byMonth = (list: Occurrence[]) => {
  const m = new Map<string, Occurrence[]>();
  for (const o of list) {
    const k = o.date.slice(0, 7);
    m.set(k, [...(m.get(k) ?? []), o]);
  }
  return [...m];
};
const dayLabel = (o: Occurrence) =>
  o.date.length === 10 ? weekdayDay(o.date) : o.date.length === 7 ? 'month' : 'year';

export function Calendar() {
  const v = useVault();
  const t = today();
  const year = +t.slice(0, 4);
  const all = occurrences(v, year - 3, year + 1);
  const daily = new Map(
    v.notes.filter((n) => kind(n.id) === 'daily').map((n) => [n.id.slice(6), n]),
  );
  const horizon = `${year + 1}${t.slice(4)}`;
  const upcoming = all.filter((o) => last(o) >= t && o.date <= horizon);
  const past = all
    .filter(
      (o) =>
        last(o) < t &&
        !(
          o.yearly &&
          o.date.slice(0, 4) !== String(year) &&
          o.date.slice(0, 4) !== String(year - 1)
        ),
    )
    .reverse();
  const days = (o: Occurrence) =>
    o.date.length === 10 ? Math.round((Date.parse(o.date) - Date.parse(t)) / 864e5) : null;
  const when = (o: Occurrence) => {
    const n = days(o);
    return n === 0
      ? 'today'
      : n === 1
        ? 'tomorrow'
        : n != null && n > 0 && n < 45
          ? `in ${n} days`
          : '';
  };

  const part = (label: string, list: Occurrence[], isPast: boolean) =>
    list.length > 0 && (
      <div className="mt-12 first:mt-0">
        <h2 className="m-0 mb-5 text-2xl font-bold tracking-tight">{label}</h2>
        {byMonth(list).map(([month, items]) => (
          <Section key={month} title={monthName(month)} count={items.length} className="mt-8">
            <ul className="m-0 grid list-none gap-0.5 p-0">
              {items.map((o) => {
                const dn = daily.get(o.date);
                const soon = !isPast && when(o);
                return (
                  <li
                    key={`${o.note.id} ${o.date} ${o.what}`}
                    className={cn(
                      'm-0 -mx-2 grid grid-cols-[4.5rem_1fr] gap-x-4 rounded-md px-2 py-1.5 has-[[data-nav]:focus-visible]:bg-accent/60',
                      o.date === t && 'bg-accent',
                    )}
                  >
                    <span className="pt-px text-sm text-faint tabular-nums">
                      {dn ? (
                        <a
                          className="text-inherit no-underline hover:underline"
                          href={link(hrefOf(dn))}
                        >
                          {dayLabel(o)}
                        </a>
                      ) : (
                        dayLabel(o)
                      )}
                    </span>
                    <span className={cn('min-w-0', isPast && 'text-muted-foreground')}>
                      {o.what}
                      {!!o.end && <span className="text-faint"> until {fmtDay(o.end)}</span>}
                      {!!soon && (
                        <span
                          className={cn(
                            'ml-2 text-xs font-semibold',
                            days(o) === 0 || days(o) === 1 ? 'text-destructive' : 'text-warning',
                          )}
                        >
                          {soon}
                        </span>
                      )}
                      <a
                        data-nav={true}
                        className={cn(lnk, 'block w-fit rounded-sm text-sm', navRow)}
                        href={link(hrefOf(o.note))}
                      >
                        {titleOf(o.note)}
                      </a>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>
    );

  return (
    <div className="v-calendar">
      <PageHeader
        kind="calendar"
        title="Calendar"
        lede={
          <>
            Every date recorded in a note. Add one with a note's <code className={code}>dates</code>{' '}
            field.
          </>
        }
      />
      {part('Coming up', upcoming, false)}
      {part('Past', past, true)}
    </div>
  );
}

/** On a note: its dates, yearly ones first. */
export function NoteDates({ note }: { note: Note }) {
  const dates = datesOf(note).sort(
    (a, b) => Number(b.yearly) - Number(a.yearly) || b.date.localeCompare(a.date),
  );
  const v = useVault();
  if (!dates.length) return null;
  /** The day's daily note, for a one-off date that has one: where the row links. */
  const daily = (d: string) => (d.length === 10 ? v.byId.get(`daily/${d}`) : undefined);
  return (
    <Section
      title="Dates"
      action={
        <a className={lnk} href={link('/calendar/')}>
          calendar →
        </a>
      }
    >
      <FieldList>
        {dates.map((x) => (
          <Field
            key={`${x.date} ${x.what}`}
            date={true}
            label={
              <time>
                {x.yearly ? `${fmtDay(x.date, false)} yearly` : fmtDay(x.date)}
                {!!x.end && ` – ${fmtDay(x.end)}`}
              </time>
            }
          >
            {daily(x.date) ? (
              <a
                data-nav={true}
                className={cn('rounded-sm text-inherit no-underline hover:underline', navRow)}
                href={link(hrefOf(daily(x.date)!))}
              >
                {x.what}
              </a>
            ) : (
              x.what
            )}
          </Field>
        ))}
      </FieldList>
    </Section>
  );
}

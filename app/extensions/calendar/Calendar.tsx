// Every dated entry (the `dates` field, conventions §3): upcoming first, then the past newest first.
// Yearly entries repeat. A day with a daily note links to it.
import type { Note } from '../../../core/note-fields.ts';
import { hrefOf, titleOf, kind } from '../../../core/note-fields.ts';
import { datesOf } from '../../../core/facts.ts';
import { fmtDay, lastDay, monthName, today, weekdayDay } from '../../../core/format.ts';
import { occurrences, type Occurrence } from './dates.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './calendar.css';

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

  const section = (label: string, list: Occurrence[], isPast: boolean) =>
    list.length > 0 && (
      <section className={`cal ${isPast ? 'past' : ''}`}>
        <h2>{label}</h2>
        {byMonth(list).map(([month, items]) => (
          <div key={month} className="month">
            <h3>{monthName(month)}</h3>
            <ul>
              {items.map((o) => {
                const dn = daily.get(o.date);
                return (
                  <li
                    key={`${o.note.id} ${o.date} ${o.what}`}
                    className={o.date === t ? 'now' : ''}
                  >
                    <span className="day">
                      {dn ? <a href={link(hrefOf(dn))}>{dayLabel(o)}</a> : dayLabel(o)}
                    </span>
                    <span className="what">
                      {o.what}
                      {!!o.end && <span className="end"> until {fmtDay(o.end)}</span>}
                      {!isPast && when(o) && <em>{when(o)}</em>}
                      <a className="src" href={link(hrefOf(o.note))}>
                        {titleOf(o.note)}
                      </a>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    );

  return (
    <div className="v-calendar">
      <div className="meta">
        <span className="chip">calendar</span>
      </div>
      <h1>Calendar</h1>
      <p className="lede">
        Every date recorded in a note. Add one with a note's <code>dates</code> field.
      </p>
      {section('Coming up', upcoming, false)}
      {section('Past', past, true)}
    </div>
  );
}

/** On a note: its dates, yearly ones first. */
export function NoteDates({ note }: { note: Note }) {
  const dates = datesOf(note).sort(
    (a, b) => Number(b.yearly) - Number(a.yearly) || b.date.localeCompare(a.date),
  );
  if (!dates.length) return null;
  return (
    <section className="sect">
      <h2>
        Dates{' '}
        <a className="more" href={link('/calendar/')}>
          calendar →
        </a>
      </h2>
      <ul className="dates">
        {dates.map((x) => (
          <li key={`${x.date} ${x.what}`}>
            <time>
              {x.yearly ? `${fmtDay(x.date, false)} yearly` : fmtDay(x.date)}
              {!!x.end && ` – ${fmtDay(x.end)}`}
            </time>
            {x.what}
          </li>
        ))}
      </ul>
    </section>
  );
}

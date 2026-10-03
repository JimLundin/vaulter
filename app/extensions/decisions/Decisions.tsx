// Every decision recorded in a note (the `decisions` field, conventions §3), newest first, by month,
// with its reason when the note gives one.
import type { Note } from '../../../core/note-fields.ts';
import { facet, hrefOf, titleOf } from '../../../core/note-fields.ts';
import { perVault, type Vault } from '../../../core/derive.ts';
import { decisionsOf, type Decision } from '../../../core/facts.ts';
import { dayMonth, fmtDay, monthName } from '../../../core/format.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import './decisions.css';

const day = (d: string) => (d.length === 10 ? dayMonth(d) : fmtDay(d));

/** Every decision in the vault, newest first. */
const allDecisions = perVault((v: Vault) =>
  v.notes
    .flatMap((n) => decisionsOf(n, v.byId))
    .sort((a, b) => b.date.localeCompare(a.date) || titleOf(a.note).localeCompare(titleOf(b.note))),
);

export function Decisions() {
  const all = allDecisions(useVault());
  const groups = new Map<string, Decision[]>();
  for (const d of all) {
    const k = d.date.slice(0, 7);
    groups.set(k, [...(groups.get(k) ?? []), d]);
  }
  return (
    <div className="v-decisions">
      <div className="meta">
        <span className="chip">decisions</span>
      </div>
      <h1>Decisions</h1>
      <p className="lede">
        {all.length} decisions recorded across the vault, newest first, with the reason where one
        was given. Add one with a note's <code>decisions</code> field.
      </p>
      {[...groups].map(([month, list]) => (
        <section key={month} className="month">
          <h2>{monthName(month)}</h2>
          <ul>
            {list.map((d) => (
              <li
                key={`${d.note.id} ${d.date} ${d.what}`}
                className={`a-${facet(d.note, 'area') || 'none'}`}
              >
                <span className="day">{day(d.date)}</span>
                <span className="what">
                  <b>{d.what}</b>
                  {!!d.why && <span className="why">{d.why}</span>}
                  <span className="src">
                    <a href={link(hrefOf(d.note))}>{titleOf(d.note)}</a>
                    {!!d.who && (
                      <>
                        {' '}
                        · decided by <a href={link(hrefOf(d.who))}>{titleOf(d.who)}</a>
                      </>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** On a note: the decisions it records, newest first. */
export function NoteDecisions({ note }: { note: Note }) {
  const ds = decisionsOf(note, useVault().byId);
  if (!ds.length) return null;
  return (
    <section className="sect">
      {/* biome-ignore lint/correctness/useUniqueElementIds: a page-unique heading anchor that a route's #decisions scrolls to */}
      <h2 id="decisions">
        Decisions{' '}
        <a className="more" href={link('/decisions/')}>
          all decisions →
        </a>
      </h2>
      <ul className="dates decided">
        {ds.map((x) => (
          <li key={`${x.date} ${x.what}`}>
            <time>{fmtDay(x.date)}</time>
            <span>
              {x.what}
              {!!x.who && (
                <>
                  {' '}
                  · <a href={link(hrefOf(x.who))}>{titleOf(x.who)}</a>
                </>
              )}
              {!!x.why && <small>{x.why}</small>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Home's sections, under the Home note: laid out from each note's facet tags (area/, status/, circle/;
// conventions §3) and from what the daily log links to. Nothing is hand-maintained: tag a note and it appears.
import type { Note } from '../../../core/note-fields.ts';
import { facet, titleOf, excerptOf, kind, asList } from '../../../core/note-fields.ts';
import { isTopical, perVault, type Vault } from '../../../core/derive.ts';
import type { Schema } from '../../../core/schema.ts';
import { dateStr, dayMonth, longDay, shortDay, today } from '../../../core/format.ts';
import { computeBrief } from '../../../core/brief.ts';
import { useSchema, useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import { to } from '../notes/sections.tsx';

/** What every section sorts and groups by, once per vault. */
const home = perVault((v: Vault) => {
  const { lastSeen, degree } = v.signals;
  const topical = v.notes.filter(isTopical);
  const seen = (n: Note) => lastSeen.get(n.id) ?? '';
  const byTitle = (a: Note, b: Note) => titleOf(a).localeCompare(titleOf(b));
  const byWeight = (a: Note, b: Note) =>
    (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || byTitle(a, b);
  // In focus: active outside leisure (what Jim reads or plays shows under Leisure), most recently logged first.
  const active = topical
    .filter((n) => facet(n, 'status') === 'active' && facet(n, 'area') !== 'leisure')
    .sort(
      (a, b) =>
        (seen(b) || dateStr(b.data.created)).localeCompare(seen(a) || dateStr(a.data.created)) ||
        byWeight(a, b),
    );
  const dailies = v.notes
    .filter((n) => kind(n.id) === 'daily')
    .sort((a, b) => b.id.localeCompare(a.id));
  return { topical, seen, byTitle, byWeight, active, dailies };
});

/** Notes grouped by type, in the schema's order, each group by status then weight. */
const byType = (
  { types, statusRank }: Schema,
  list: Note[],
  byWeight: (a: Note, b: Note) => number,
) => {
  const known = new Set(types.map((t) => t.key));
  return [...types, { key: '', label: 'Other' }]
    .map((t) => ({
      label: t.label,
      items: list
        .filter((n) => (t.key ? n.data.type === t.key : !known.has(n.data.type)))
        .sort(
          (a, b) =>
            statusRank(facet(a, 'status')) - statusRank(facet(b, 'status')) || byWeight(a, b),
        ),
    }))
    .filter((g) => g.items.length);
};

const Inline = ({ notes }: { notes: Note[] }) => (
  <ul className="inline">
    {notes.map((n) => {
      const s = facet(n, 'status');
      return (
        <li key={n.id} className={s ? `s-${s}` : ''}>
          <a href={to(n)}>{titleOf(n)}</a>
          {s && s !== 'active' && <small>{s}</small>}
        </li>
      );
    })}
  </ul>
);

export function Today() {
  const v = useVault();
  const b = computeBrief(v, today());
  const a = (n: Note | null, t: string) => (n ? <a href={to(n)}>{t}</a> : t);
  const ev = (x: (typeof b.on)[number]) => (
    <>
      {x.what}
      {!!x.end && <span className="b-end"> until {shortDay(x.end)}</span>} ·{' '}
      {a(x.note, titleOf(x.note))}
    </>
  );
  return (
    <section className="brief">
      <h2>
        Today{' '}
        <a className="hub" href={link('/calendar/')}>
          Calendar →
        </a>
      </h2>
      <div className="brief-body">
        <p className="b-day">{longDay(b.today)}</p>
        {b.on.length ? (
          <ul className="b-today">
            {b.on.map((x) => (
              <li key={`${x.note.id}|${x.date}|${x.what}`}>{ev(x)}</li>
            ))}
          </ul>
        ) : (
          <p className="b-quiet">Nothing on the calendar today.</p>
        )}
        {b.soon.length > 0 && (
          <>
            <h3>This week</h3>
            <ul className="b-list">
              {b.soon.map((x) => (
                <li key={`${x.note.id}|${x.date}|${x.what}`}>
                  <span className="b-when">{shortDay(x.date)}</span>
                  <span>{ev(x)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {b.fus.length > 0 && (
          <>
            <h3>Follow-ups</h3>
            <ul className="b-list">
              {b.fus.map((f) => (
                <li key={`${f.note.id}|${f.by}|${f.what}`} className={f.due ? 'b-due' : ''}>
                  <span className="b-when">
                    {f.late
                      ? 'overdue'
                      : f.due
                        ? 'due'
                        : f.by
                          ? f.by.length === 10
                            ? shortDay(f.by)
                            : f.by
                          : ''}
                  </span>
                  <span>
                    {f.what}
                    {!!(f.who || f.whoName) && (
                      <> ({a(f.who, f.who ? titleOf(f.who) : f.whoName)})</>
                    )}{' '}
                    · {a(f.note, titleOf(f.note))}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        {b.question ? (
          <>
            <h3>A question</h3>
            <p className="b-q">
              {b.question.q} · {a(b.question.note, titleOf(b.question.note))}
            </p>
          </>
        ) : null}
        {b.back.length > 0 && (
          <>
            <h3>Looking back</h3>
            <ul className="b-back">
              {b.back.map((x) => (
                <li key={x.label}>
                  <b>{x.label}</b>, {a(x.note, shortDay(x.note.id.slice(6)))}: {x.text}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

export function InFocus() {
  const { active, seen } = home(useVault());
  const { areaOf } = useSchema();
  if (!active.length) return null;
  return (
    <section>
      <h2>
        In focus <span className="n">{active.length}</span>
      </h2>
      <ul className="cards">
        {active.slice(0, 6).map((n) => (
          <li key={n.id}>
            <a href={to(n)}>
              <b>{titleOf(n)}</b>
              <span className="ex">{excerptOf(n, 130)}</span>
              <span className="foot">
                <span className="area">{areaOf.get(facet(n, 'area'))?.label ?? ''}</span>
                {seen(n) && <span>last logged {dayMonth(seen(n))}</span>}
              </span>
            </a>
          </li>
        ))}
      </ul>
      {active.length > 6 && (
        <p className="also">
          <span>Also active</span>
          {active.slice(6).map((n, i) => (
            <Fragment key={n.id}>
              {i > 0 && ' · '}
              <a href={to(n)}>{titleOf(n)}</a>
            </Fragment>
          ))}
        </p>
      )}
    </section>
  );
}

/** Anything else the log mentioned in the 14 days before its latest entry. */
export function Recent() {
  const { topical, active, dailies, seen, byWeight } = home(useVault());
  const latest = dailies[0]?.id.slice(6) ?? '';
  const cutoff = latest ? new Date(Date.parse(latest) - 14 * 864e5).toISOString().slice(0, 10) : '';
  const recent = topical
    .filter((n) => !active.includes(n) && seen(n) && seen(n) >= cutoff)
    .sort((a, b) => seen(b).localeCompare(seen(a)) || byWeight(a, b))
    .slice(0, 14);
  if (!recent.length) return null;
  return (
    <section>
      <h2>Recently touched</h2>
      <ul className="pills">
        {recent.map((n) => (
          <li key={n.id}>
            <a href={to(n)}>{titleOf(n)}</a>
            <small>{dayMonth(seen(n))}</small>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Areas() {
  const v = useVault();
  const { topical, byWeight } = home(v);
  return (
    <>
      {v.schema.areas.map((a) => {
        const list = topical.filter((n) => facet(n, 'area') === a.key && n.data.type !== 'person');
        if (!list.length) return null;
        const hub = a.hub ? v.byId.get(a.hub) : undefined;
        return (
          <section key={a.key} id={`area-${a.key}`}>
            <h2>
              {a.label} <span className="n">{list.length}</span>
              {hub ? (
                <a className="hub" href={to(hub)}>
                  {titleOf(hub)} hub →
                </a>
              ) : null}
            </h2>
            <dl className="groups">
              {byType(
                v.schema,
                list.filter((n) => n !== hub),
                byWeight,
              ).map((g) => (
                <div key={g.label}>
                  <dt>{g.label}</dt>
                  <dd>
                    <Inline notes={g.items} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}
    </>
  );
}

export function People() {
  const { topical, byWeight } = home(useVault());
  const { circles } = useSchema();
  const people = topical.filter((n) => n.data.type === 'person' && facet(n, 'circle'));
  if (!people.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#people), rendered once; useId would break it
    <section id="people">
      <h2>
        People <span className="n">{people.length}</span>
      </h2>
      <dl className="groups">
        {circles.map((c) => {
          const list = people.filter((n) => facet(n, 'circle') === c.key).sort(byWeight);
          return (
            list.length > 0 && (
              <div key={c.key}>
                <dt>{c.label}</dt>
                <dd>
                  <Inline notes={list} />
                </dd>
              </div>
            )
          );
        })}
      </dl>
    </section>
  );
}

export function Untagged() {
  const { topical, byTitle } = home(useVault());
  const list = topical
    .filter((n) => !(facet(n, 'area') || (n.data.type === 'person' && facet(n, 'circle'))))
    .sort(byTitle);
  if (!list.length) return null;
  return (
    <section>
      <h2>
        Not yet tagged <span className="n">{list.length}</span>
      </h2>
      <Inline notes={list} />
    </section>
  );
}

/** Every open question, by note: active things first, then by how many are open. */
export function AllOpenQuestions() {
  const { topical, byTitle } = home(useVault());
  const withOpen = topical
    .map((n) => ({ n, q: asList(n.data.open) }))
    .filter((x) => x.q.length)
    .sort(
      (a, b) =>
        Number(facet(b.n, 'status') === 'active') - Number(facet(a.n, 'status') === 'active') ||
        b.q.length - a.q.length ||
        byTitle(a.n, b.n),
    );
  if (!withOpen.length) return null;
  return (
    <section className="log">
      <details>
        <summary>
          Open questions{' '}
          <span className="n">
            {withOpen.reduce((s, x) => s + x.q.length, 0)} across {withOpen.length} notes
          </span>
        </summary>
        <dl className="oq">
          {withOpen.map(({ n, q }) => (
            <div key={n.id}>
              <dt>
                <a href={to(n)}>{titleOf(n)}</a>
              </dt>
              <dd>
                <ul>
                  {q.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

export function DailyLog() {
  const { dailies } = home(useVault());
  if (!dailies.length) return null;
  const entries = (n: Note) => (n.body.match(/^\s*[-*] /gm) ?? []).length;
  return (
    <section className="log">
      <details>
        <summary>
          Daily log{' '}
          <span className="n">
            {dailies.length} days · latest {dayMonth(dailies[0].id.slice(6))}
          </span>
        </summary>
        <ul className="days">
          {dailies.map((n) => (
            <li key={n.id}>
              <a href={to(n)}>{n.id.slice(6)}</a>
              <small>
                {entries(n)} {entries(n) === 1 ? 'entry' : 'entries'}
              </small>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// Every decision recorded in a note (the `decisions` field, conventions §3), newest first, by month,
// with its reason when the note gives one.
import type { Note } from '../notes/model/fields.ts';
import { facet, hrefOf, titleOf } from '../notes/model/fields.ts';
import { perVault, type Vault } from '../graph/model/graph.ts';
import { decisionsOf, type Decision } from '../notes/model/facts.ts';
import { dayMonth, fmtDay, monthName } from '../../core/format.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { cn } from 'cn';
import { Field, FieldList, PageHeader, Section } from '@/components/layout.tsx';
import { decisionsPage } from './routes.ts';

const lnk = 'text-primary no-underline hover:underline';
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
      <PageHeader
        kind="decisions"
        title="Decisions"
        lede={
          <>
            {all.length} decisions recorded across the vault, newest first, with the reason where
            one was given. Add one with a note's{' '}
            <code className="rounded-sm bg-surface px-1 font-mono text-sm">decisions</code> field.
          </>
        }
      />
      {[...groups].map(([month, list]) => (
        <Section key={month} title={monthName(month)} count={list.length}>
          <ul className="m-0 grid list-none gap-2 p-0">
            {list.map((d) => (
              <li
                key={`${d.note.id} ${d.date} ${d.what}`}
                className={cn(
                  'm-0 grid grid-cols-[4.5rem_1fr] gap-x-4 rounded-r-md border-l-2 max-sm:grid-cols-1 border-(--c) py-1 pl-3 has-[[data-nav]:focus-visible]:bg-accent/60',
                  `a-${facet(d.note, 'area') || 'none'}`,
                )}
              >
                <span className="pt-px text-sm text-faint tabular-nums">{day(d.date)}</span>
                <span className="min-w-0">
                  <b className="font-medium">{d.what}</b>
                  {!!d.why && <span className="block text-sm text-muted-foreground">{d.why}</span>}
                  <span className="block text-sm">
                    <a
                      data-nav={true}
                      className={cn(
                        lnk,
                        '-mx-1 rounded-sm px-1',
                        'data-[nav]:focus-visible:bg-accent data-[nav]:focus-visible:outline-2',
                      )}
                      href={link(hrefOf(d.note))}
                    >
                      {titleOf(d.note)}
                    </a>
                    {!!d.who && (
                      <span className="text-faint">
                        {' '}
                        · decided by{' '}
                        <a className={lnk} href={link(hrefOf(d.who))}>
                          {titleOf(d.who)}
                        </a>
                      </span>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </div>
  );
}

/** On a note: the decisions it records, newest first. */
export function NoteDecisions({ note }: { note: Note }) {
  const ds = decisionsOf(note, useVault().byId);
  if (!ds.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a page-unique anchor that a route's #decisions scrolls to
    <Section
      id="decisions"
      title="Decisions"
      action={
        <a className={lnk} href={link(decisionsPage.href())}>
          all decisions →
        </a>
      }
    >
      <FieldList>
        {ds.map((x) => (
          <Field key={`${x.date} ${x.what}`} date={true} label={<time>{fmtDay(x.date)}</time>}>
            {x.what}
            {!!x.who && (
              <>
                {' '}
                ·{' '}
                <a className={lnk} href={link(hrefOf(x.who))}>
                  {titleOf(x.who)}
                </a>
              </>
            )}
            {!!x.why && <small className="block text-sm text-muted-foreground">{x.why}</small>}
          </Field>
        ))}
      </FieldList>
    </Section>
  );
}

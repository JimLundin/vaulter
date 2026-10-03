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
import { Fragment, type ReactNode } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from 'cn';
import { to } from '../notes/sections.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import { Eyebrow, Field, FieldList, Section } from '@/components/layout.tsx';

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

const lnk = 'text-primary no-underline hover:underline';
const flat = 'm-0 list-none p-0 [&_li]:m-0';

/** Notes as a wrapping run of links: active ones bold with a dot, finished or parked ones muted. */
const Inline = ({ notes }: { notes: Note[] }) => (
  <ul className={cn(flat, 'flex flex-wrap gap-x-4 gap-y-0.5')}>
    {notes.map((n) => {
      const s = facet(n, 'status');
      return (
        <li key={n.id}>
          <a
            href={to(n)}
            className={cn(
              lnk,
              s === 'active' &&
                'font-semibold before:mr-1.5 before:inline-block before:size-2 before:rounded-full before:bg-success',
              (s === 'done' || s === 'backlog' || s === 'paused') && 'text-primary/70',
            )}
          >
            {titleOf(n)}
          </a>
          {!!s && s !== 'active' && <small className="ml-1.5 text-xs text-faint">{s}</small>}
        </li>
      );
    })}
  </ul>
);

interface Row {
  key: string;
  when: string;
  due?: boolean;
  what: ReactNode;
}

/** A dated list: the when in a narrow column (faint, or destructive when due), the what beside it. */
const Dated = ({ rows }: { rows: Row[] }) => (
  <ul className={cn(flat, 'grid gap-1')}>
    {rows.map((r) => (
      <li key={r.key} className="grid grid-cols-[6rem_1fr] items-baseline gap-x-3">
        <span
          className={cn(
            'text-sm tabular-nums',
            r.due ? 'font-semibold text-destructive' : 'text-faint',
          )}
        >
          {r.when}
        </span>
        <span className="min-w-0">{r.what}</span>
      </li>
    ))}
  </ul>
);

export function Today() {
  const v = useVault();
  const b = computeBrief(v, today());
  const a = (n: Note | null, t: string) =>
    n ? (
      <a className={lnk} href={to(n)}>
        {t}
      </a>
    ) : (
      t
    );
  const ev = (x: (typeof b.on)[number]) => (
    <>
      {x.what}
      {!!x.end && <span className="text-faint"> until {shortDay(x.end)}</span>} ·{' '}
      {a(x.note, titleOf(x.note))}
    </>
  );
  return (
    <Section
      title="Today"
      action={
        <a className={lnk} href={link('/calendar/')}>
          Calendar →
        </a>
      }
    >
      <p className="mt-0 mb-3 font-semibold text-muted-foreground">{longDay(b.today)}</p>
      <FieldList>
        <Field label="On">
          {b.on.length ? (
            <ul className={cn(flat, 'grid gap-1')}>
              {b.on.map((x) => (
                <li key={`${x.note.id}|${x.date}|${x.what}`}>{ev(x)}</li>
              ))}
            </ul>
          ) : (
            <span className="text-faint">Nothing on the calendar today.</span>
          )}
        </Field>
        {b.soon.length > 0 && (
          <Field label="This week">
            <Dated
              rows={b.soon.map((x) => ({
                key: `${x.note.id}|${x.date}|${x.what}`,
                when: shortDay(x.date),
                what: ev(x),
              }))}
            />
          </Field>
        )}
        {b.fus.length > 0 && (
          <Field label="Follow-ups">
            <Dated
              rows={b.fus.map((f) => ({
                key: `${f.note.id}|${f.by}|${f.what}`,
                due: f.due,
                when: f.late
                  ? 'overdue'
                  : f.due
                    ? 'due'
                    : f.by
                      ? f.by.length === 10
                        ? shortDay(f.by)
                        : f.by
                      : '',
                what: (
                  <>
                    {f.what}
                    {!!(f.who || f.whoName) && (
                      <> ({a(f.who, f.who ? titleOf(f.who) : f.whoName)})</>
                    )}{' '}
                    · {a(f.note, titleOf(f.note))}
                  </>
                ),
              }))}
            />
          </Field>
        )}
        {!!b.question && (
          <Field label="A question">
            {b.question.q} · {a(b.question.note, titleOf(b.question.note))}
          </Field>
        )}
        {b.back.length > 0 && (
          <Field label="Looking back">
            <ul className={cn(flat, 'grid gap-1.5 text-sm text-muted-foreground')}>
              {b.back.map((x) => (
                <li key={x.label}>
                  <b className="font-semibold text-foreground">{x.label}</b>,{' '}
                  {a(x.note, shortDay(x.note.id.slice(6)))}: {x.text}
                </li>
              ))}
            </ul>
          </Field>
        )}
      </FieldList>
    </Section>
  );
}

export function InFocus() {
  const { active, seen } = home(useVault());
  const { areaOf } = useSchema();
  if (!active.length) return null;
  return (
    <Section title="In focus" count={active.length}>
      <ul
        className={cn(flat, 'grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3')}
      >
        {active.slice(0, 6).map((n) => {
          const area = facet(n, 'area');
          return (
            <li key={n.id}>
              <Card className="relative h-full gap-2 py-4 shadow-none transition-colors hover:border-primary">
                <CardHeader className="block px-4">
                  <CardTitle className="leading-snug">
                    {/* The title's link covers the whole card. */}
                    <a className={cn(lnk, 'after:absolute after:inset-0')} href={to(n)}>
                      {titleOf(n)}
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 px-4 text-sm text-muted-foreground">
                  {excerptOf(n, 130)}
                </CardContent>
                <CardFooter className="justify-between gap-2 px-4 pt-1 text-xs">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 font-medium text-muted-foreground',
                      `a-${area || 'none'}`,
                    )}
                  >
                    <span className="size-2 rounded-full bg-(--c)" />
                    {areaOf.get(area)?.label ?? ''}
                  </span>
                  {!!seen(n) && <span className="text-faint">last logged {dayMonth(seen(n))}</span>}
                </CardFooter>
              </Card>
            </li>
          );
        })}
      </ul>
      {active.length > 6 && (
        <p className="mt-4 mb-0">
          <Eyebrow className="mr-2">Also active</Eyebrow>
          {active.slice(6).map((n, i) => (
            <Fragment key={n.id}>
              {i > 0 && <span className="text-faint"> · </span>}
              <a className={lnk} href={to(n)}>
                {titleOf(n)}
              </a>
            </Fragment>
          ))}
        </p>
      )}
    </Section>
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
    <Section title="Recently touched">
      <ul className={cn(flat, 'flex flex-wrap gap-2')}>
        {recent.map((n) => (
          <li key={n.id}>
            <Badge asChild={true} variant="outline" className="gap-1.5 px-2.5 text-sm font-normal">
              <a className="no-underline" href={to(n)}>
                {titleOf(n)}
                <span className="text-xs text-faint tabular-nums">{dayMonth(seen(n))}</span>
              </a>
            </Badge>
          </li>
        ))}
      </ul>
    </Section>
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
          <Section
            key={a.key}
            id={`area-${a.key}`}
            title={a.label}
            count={list.length}
            action={
              !!hub && (
                <a className={lnk} href={to(hub)}>
                  {titleOf(hub)} hub →
                </a>
              )
            }
          >
            <FieldList>
              {byType(
                v.schema,
                list.filter((n) => n !== hub),
                byWeight,
              ).map((g) => (
                <Field key={g.label} label={g.label}>
                  <Inline notes={g.items} />
                </Field>
              ))}
            </FieldList>
          </Section>
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
    <Section id="people" title="People" count={people.length}>
      <FieldList>
        {circles.map((c) => {
          const list = people.filter((n) => facet(n, 'circle') === c.key).sort(byWeight);
          return (
            list.length > 0 && (
              <Field key={c.key} label={c.label}>
                <Inline notes={list} />
              </Field>
            )
          );
        })}
      </FieldList>
    </Section>
  );
}

export function Untagged() {
  const { topical, byTitle } = home(useVault());
  const list = topical
    .filter((n) => !(facet(n, 'area') || (n.data.type === 'person' && facet(n, 'circle'))))
    .sort(byTitle);
  if (!list.length) return null;
  return (
    <Section title="Not yet tagged" count={list.length}>
      <Inline notes={list} />
    </Section>
  );
}

/** A bordered panel, closed until opened; consecutive ones sit close together. */
const Panel = ({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) => (
  <section data-panel={true} className="mt-10 [[data-panel]+&]:mt-3">
    <Collapsible className="rounded-lg border">
      <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-2 rounded-lg px-4 py-2.5 text-left font-semibold hover:bg-surface">
        <ChevronRightIcon className="size-4 shrink-0 text-faint transition-transform group-data-[state=open]:rotate-90" />
        {title}
        <span className="text-sm font-normal text-faint tabular-nums">{count}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pt-1 pb-4">{children}</CollapsibleContent>
    </Collapsible>
  </section>
);

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
    <Panel
      title="Open questions"
      count={`${withOpen.reduce((s, x) => s + x.q.length, 0)} across ${withOpen.length} notes`}
    >
      <dl className="m-0 grid gap-3">
        {withOpen.map(({ n, q }) => (
          <div key={n.id}>
            <dt className="font-semibold">
              <a className={lnk} href={to(n)}>
                {titleOf(n)}
              </a>
            </dt>
            <dd className="m-0">
              <ul className="m-0 mt-0.5 list-disc pl-5 text-sm text-muted-foreground [&_li]:my-0.5">
                {q.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

export function DailyLog() {
  const { dailies } = home(useVault());
  if (!dailies.length) return null;
  const entries = (n: Note) => (n.body.match(/^\s*[-*] /gm) ?? []).length;
  return (
    <Panel
      title="Daily log"
      count={`${dailies.length} days · latest ${dayMonth(dailies[0].id.slice(6))}`}
    >
      <ul
        className={cn(flat, 'tabular-nums [columns:3_9rem] [&_li]:mb-1 [&_li]:break-inside-avoid')}
      >
        {dailies.map((n) => (
          <li key={n.id}>
            <a className={lnk} href={to(n)}>
              {n.id.slice(6)}
            </a>
            <small className="ml-1.5 text-xs text-faint">
              {entries(n)} {entries(n) === 1 ? 'entry' : 'entries'}
            </small>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

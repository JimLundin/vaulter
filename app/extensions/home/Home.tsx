// Home's dashboard, under the Home note: today and what's in focus beside what was touched lately, the
// open questions and the log; then every area, the people and anything untagged as tabs. Laid out from
// the notes' tags (data.ts): nothing is hand-maintained, tag a note and it appears.
import type { Note } from '../notes/model/fields.ts';
import { facet, titleOf, excerptOf } from '../notes/model/fields.ts';
import { dayMonth, longDay, shortDay, today } from '../../core/format.ts';
import { computeBrief } from './brief.ts';
import { useSchema, useVault } from '../../core/host.tsx';
import { link, useRoute } from '../../core/route.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { ChevronRightIcon } from 'lucide-react';
import { cn } from 'cn';
import { to } from '../notes/sections.tsx';
import { NoteBody } from '../notes/NotePage.tsx';
import { byType, home } from './data.ts';
import { Badge } from '@/components/ui/badge.tsx';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.tsx';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { Eyebrow, Field, FieldList, Section } from '@/components/layout.tsx';
import { calendarPage } from '../calendar/routes.ts';

const lnk = 'text-primary no-underline hover:underline';
const flat = 'm-0 list-none p-0 [&_li]:m-0';
/** A focusable row (data-nav) when j/k lands on it. */
const row =
  'rounded-md outline-none data-[nav]:focus-visible:bg-accent data-[nav]:focus-visible:ring-2 data-[nav]:focus-visible:ring-ring/50';

/** Home: the note's body as the lede, the dashboard (two columns when wide), then the tabs. */
export function HomePage({ note }: { note: Note }) {
  return (
    <>
      <NoteBody note={note} className="text-muted-foreground [&_h1]:text-foreground" />
      <div className="mt-8 grid gap-10 @4xl:grid-cols-[minmax(0,1fr)_19rem] @5xl:grid-cols-[minmax(0,1fr)_22rem] @4xl:gap-x-12">
        <div className="min-w-0">
          <Today />
          <InFocus />
        </div>
        <aside className="min-w-0">
          <Recent />
          <OpenQuestions />
          <DailyLog />
        </aside>
      </div>
      <AreaTabs />
    </>
  );
}

/** Notes as a wrapping run of links: active ones bold with a dot, finished or parked ones muted. */
const Inline = ({ notes }: { notes: Note[] }) => (
  <ul className={cn(flat, 'flex flex-wrap gap-x-4 gap-y-0.5')}>
    {notes.map((n) => {
      const s = facet(n, 'status');
      return (
        <li key={n.id}>
          <a
            data-nav={true}
            href={to(n)}
            className={cn(
              lnk,
              row,
              '-mx-1 px-1',
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
      count={longDay(b.today)}
      action={
        <a className={lnk} href={link(calendarPage.href())}>
          Calendar →
        </a>
      }
    >
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
      <ul className={cn(flat, 'grid gap-3 @xl:grid-cols-2')}>
        {active.slice(0, 6).map((n) => {
          const area = facet(n, 'area');
          return (
            <li key={n.id}>
              <Card className="relative h-full gap-2 py-4 shadow-none transition-colors hover:border-primary has-[a:focus-visible]:border-primary has-[a:focus-visible]:bg-accent has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50">
                <CardHeader className="block px-4">
                  <CardTitle className="leading-snug">
                    {/* The title's link covers the whole card. */}
                    <a
                      data-nav={true}
                      className={cn(lnk, 'outline-none after:absolute after:inset-0')}
                      href={to(n)}
                    >
                      {titleOf(n)}
                    </a>
                  </CardTitle>
                </CardHeader>
                <CardContent className="line-clamp-3 flex-1 px-4 text-sm text-muted-foreground @max-lg:hidden">
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
              <a data-nav={true} className={cn(lnk, row)} href={to(n)}>
                {titleOf(n)}
              </a>
            </Fragment>
          ))}
        </p>
      )}
    </Section>
  );
}

/** What else the log mentioned lately (data.ts). */
export function Recent() {
  const { recent, seen } = home(useVault());
  if (!recent.length) return null;
  return (
    <Section title="Recently touched">
      <ul className={cn(flat, 'flex flex-wrap gap-2')}>
        {recent.map((n) => (
          <li key={n.id}>
            <Badge
              asChild={true}
              variant="outline"
              className="gap-1.5 px-2.5 text-sm font-normal data-[nav]:focus-visible:border-primary data-[nav]:focus-visible:bg-accent"
            >
              <a data-nav={true} className="no-underline" href={to(n)}>
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

/** A row that opens to show more: a chevron, the title, a count. */
const Opens = ({
  title,
  count,
  children,
}: {
  title: ReactNode;
  count: ReactNode;
  children: ReactNode;
}) => (
  // A grid, so the trigger stretches over its negative margins.
  <Collapsible className="grid">
    <CollapsibleTrigger
      data-nav={true}
      className={cn(
        row,
        'group -mx-2 flex cursor-pointer items-center gap-2 px-2 py-1 text-left hover:bg-surface',
      )}
    >
      <ChevronRightIcon className="size-3.5 shrink-0 text-faint transition-transform group-data-[state=open]:rotate-90" />
      <span className="min-w-0 flex-1">{title}</span>
      <span className="text-sm text-faint tabular-nums">{count}</span>
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-1 pb-2 pl-5.5">{children}</CollapsibleContent>
  </Collapsible>
);

/** Every open question, by note (data.ts orders them); each note opens to its questions. */
export function OpenQuestions() {
  const { questions } = home(useVault());
  const [all, setAll] = useState(false);
  if (!questions.length) return null;
  const total = questions.reduce((s, x) => s + x.q.length, 0);
  const shown = all ? questions : questions.slice(0, 6);
  return (
    <Section title="Open questions" count={`${total} in ${questions.length} notes`}>
      <ul className={cn(flat, 'grid')}>
        {shown.map(({ n, q }) => (
          <li key={n.id}>
            <Opens title={titleOf(n)} count={q.length}>
              <ul className="m-0 list-disc pl-4 text-sm text-muted-foreground [&_li]:my-0.5">
                {q.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
              <a className={cn(lnk, 'text-sm')} href={to(n)}>
                Open {titleOf(n)} →
              </a>
            </Opens>
          </li>
        ))}
      </ul>
      {questions.length > shown.length && (
        <button
          type="button"
          className="mt-1 cursor-pointer text-sm text-primary hover:underline"
          onClick={() => setAll(true)}
        >
          All {questions.length} notes
        </button>
      )}
    </Section>
  );
}

/** The latest days of the log, then the rest behind a toggle. */
export function DailyLog() {
  const { dailies } = home(useVault());
  if (!dailies.length) return null;
  const entries = (n: Note) => (n.body.match(/^\s*[-*] /gm) ?? []).length;
  const day = (n: Note) => (
    <li key={n.id}>
      <a
        data-nav={true}
        className={cn(
          row,
          '-mx-2 flex items-baseline justify-between gap-3 px-2 py-0.5 no-underline hover:bg-surface',
        )}
        href={to(n)}
      >
        <span className="text-primary">{shortDay(n.id.slice(6))}</span>
        <small className="text-xs text-faint tabular-nums">
          {entries(n)} {entries(n) === 1 ? 'entry' : 'entries'}
        </small>
      </a>
    </li>
  );
  return (
    <Section title="Daily log" count={`${dailies.length} days`}>
      <ul className={cn(flat, 'grid')}>{dailies.slice(0, 5).map(day)}</ul>
      {dailies.length > 5 && (
        <Opens
          title={<span className="text-sm text-muted-foreground">Earlier days</span>}
          count={dailies.length - 5}
        >
          <ul className={cn(flat, 'grid')}>{dailies.slice(5).map(day)}</ul>
        </Opens>
      )}
    </Section>
  );
}

/** Every area, the people and anything untagged, one tab each; the tab is the route's anchor
 * ("#/#work"), so a link can open one and back returns to it. */
export function AreaTabs() {
  const v = useVault();
  const { areas, people, untagged, byWeight } = home(v);
  const tabs = [
    ...areas
      .filter((a) => a.notes.length)
      .map((a) => {
        const list = a.notes.filter((n) => n !== a.hub);
        return {
          key: a.key,
          label: a.label,
          count: list.length,
          dot: a.key,
          body: (
            <>
              {!!a.hub && (
                <p className="mt-0 mb-4 text-sm">
                  <a data-nav={true} className={cn(lnk, row, 'font-medium')} href={to(a.hub)}>
                    {titleOf(a.hub)} hub →
                  </a>
                  <span className="ml-2 text-faint">{excerptOf(a.hub, 110)}</span>
                </p>
              )}
              <FieldList>
                {byType(v.schema, list, byWeight).map((g) => (
                  <Field key={g.label} label={g.label}>
                    <Inline notes={g.items} />
                  </Field>
                ))}
              </FieldList>
            </>
          ),
        };
      }),
    ...(people.length
      ? [
          {
            key: 'people',
            label: 'People',
            count: people.length,
            dot: '',
            body: (
              <FieldList>
                {v.schema.circles.map((c) => {
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
            ),
          },
        ]
      : []),
    ...(untagged.length
      ? [
          {
            key: 'untagged',
            label: 'Untagged',
            count: untagged.length,
            dot: '',
            body: <Inline notes={untagged} />,
          },
        ]
      : []),
  ];
  const keys = tabs.map((t) => t.key);
  const route = useRoute();
  const [tab, setTab] = useState(() => (keys.includes(route.anchor) ? route.anchor : keys[0]));
  // A link to a tab ("#/#people"), or back to one, opens it; picking one only rewrites the URL (no
  // hashchange, so the page stays where it is).
  const known = keys.join(' ');
  useEffect(() => {
    if (route.anchor && known.split(' ').includes(route.anchor)) setTab(route.anchor);
  }, [route, known]);
  // The open tab stays in view when the list scrolls sideways (a phone).
  const strip = useRef<HTMLDivElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tab is the trigger (a new tab is open), not something the effect reads
  useEffect(() => {
    const el = strip.current;
    const on = el?.querySelector<HTMLElement>('[data-state=active]');
    if (!(el && on)) return;
    const at = on.getBoundingClientRect().left - el.getBoundingClientRect().left;
    el.scrollLeft += at - (el.clientWidth - on.offsetWidth) / 2;
  }, [tab]);
  if (!tabs.length) return null;
  const pick = (k: string) => {
    setTab(k);
    history.replaceState(history.state, '', link(`/#${k}`));
  };
  return (
    <section className="relative mt-12">
      {/* Where a tab's link scrolls to (App scrolls to the element named by the anchor). */}
      {keys.map((k) => (
        <span key={k} id={k} className="absolute -top-16" aria-hidden={true} />
      ))}
      <Tabs value={tab} onValueChange={pick}>
        <div
          ref={strip}
          className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0"
        >
          <TabsList className="h-10! w-max">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                data-nav={true}
                className={cn('gap-2 px-3', !!t.dot && `a-${t.dot}`)}
              >
                {!!t.dot && <span className="size-2 rounded-full bg-(--c)" />}
                {t.label}
                <span className="text-xs font-normal text-faint tabular-nums">{t.count}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.key} value={t.key} className="pt-4">
            {t.body}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

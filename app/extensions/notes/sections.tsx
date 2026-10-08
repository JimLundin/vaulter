// What a note states about itself, under its body: open questions, follow-ups, connections (relations
// both ways), and the notes linking to it. NoteLinks is the list of notes every such section shares.
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import type { Note } from './model/fields.ts';
import { titleOf, hrefOf } from './model/fields.ts';
import { followUpsOf, openOf } from './model/facts.ts';
import { fmtDay } from '../../core/format.ts';
import { useVault } from '../../core/host.tsx';
import { link } from '../../core/route.ts';
import { cn } from 'cn';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.tsx';
import { Field, FieldList, Section } from '@/components/layout.tsx';

export const to = (n: Note) => link(hrefOf(n));

const plainLink = 'no-underline hover:underline';
/** A link j/k move to (core/keys.ts), and how it shows it has focus. */
export const navLink =
  'rounded-sm outline-none focus-visible:bg-accent focus-visible:no-underline focus-visible:ring-2 focus-visible:ring-ring/50';
/** A list row holding one: the whole row lights up. */
export const navRow =
  '-mx-2 rounded-md px-2 py-1 has-[[data-nav]:focus-visible]:bg-accent has-[[data-nav]:focus-visible]:ring-2 has-[[data-nav]:focus-visible]:ring-ring/50';

/** Notes as a list: each title a link (previewed on hover), then a badge and an excerpt if given. */
export function NoteLinks({
  items,
}: {
  items: { note: Note; key?: string; badge?: ReactNode; excerpt?: ReactNode }[];
}) {
  return (
    <ul data-previews={true} className="m-0 list-none space-y-1 p-0">
      {items.map(({ note, key, badge, excerpt }) => (
        <li key={key ?? note.id} className={cn('leading-snug', navRow)}>
          <a data-nav={true} href={to(note)} className={cn('font-medium outline-none', plainLink)}>
            {titleOf(note)}
          </a>
          {badge}
          {!!excerpt && <p className="m-0 mt-0.5 text-sm text-muted-foreground">{excerpt}</p>}
        </li>
      ))}
    </ul>
  );
}

export function OpenQuestions({ note }: { note: Note }) {
  const open = openOf(note);
  if (note.id === 'Home' || !open.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: the fragment target NotePage links to (#open-questions); useId would break it
    <Alert
      id="open-questions"
      role="note"
      className="mt-10 scroll-mt-20 border-warning/50 bg-warning/10 first:mt-0"
    >
      <CircleHelp className="text-warning" />
      <AlertTitle className="font-semibold">
        Open questions
        <span className="ml-2 font-normal text-faint tabular-nums">{open.length}</span>
      </AlertTitle>
      <AlertDescription className="text-foreground">
        <ul className="m-0 list-disc space-y-1 pl-4 marker:text-faint">
          {open.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function FollowUps({ note }: { note: Note }) {
  const fu = followUpsOf(note, useVault().byId);
  if (!fu.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#follow-ups); useId would break it
    <Section title="Follow-ups" id="follow-ups">
      <FieldList>
        {fu.map((f) => (
          <Field
            key={`${f.by}|${f.what}`}
            date={true}
            label={
              <time className={cn(f.due && 'text-destructive')}>
                {f.by ? fmtDay(f.by) : 'no date'}
              </time>
            }
          >
            {f.what}
            {f.who ? (
              <>
                {' '}
                ·{' '}
                <a href={to(f.who)} className={plainLink}>
                  {titleOf(f.who)}
                </a>
              </>
            ) : null}
          </Field>
        ))}
      </FieldList>
    </Section>
  );
}

export function Connections({ note }: { note: Note }) {
  const edges = useVault().graph.get(note.id) ?? [];
  if (!edges.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#connections); useId would break it
    <Section
      title="Connections"
      id="connections"
      count={edges.reduce((n, e) => n + e.notes.length, 0)}
    >
      <FieldList>
        {edges.map((e) => (
          <Field key={e.label} label={e.label}>
            {e.notes.map((n, i) => (
              <Fragment key={n.id}>
                {i > 0 && ', '}
                <a data-nav={true} href={to(n)} className={cn(plainLink, navLink)}>
                  {titleOf(n)}
                </a>
              </Fragment>
            ))}
          </Field>
        ))}
      </FieldList>
    </Section>
  );
}

export function LinkedFrom({ note }: { note: Note }) {
  const inbound = useVault().backlinks.get(note.id) ?? [];
  if (note.id === 'Home' || !inbound.length) return null;
  return (
    // biome-ignore lint/correctness/useUniqueElementIds: a stable fragment target (#linked-from); useId would break it
    <Section title="Linked from" id="linked-from" count={inbound.length}>
      <NoteLinks
        items={inbound.map((b) => ({
          note: b.from,
          key: `${b.from.id}|${b.context}`,
          excerpt: b.context,
        }))}
      />
    </Section>
  );
}

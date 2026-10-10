// Selected wiki evidence reference from prototype/wiki-provenance. A was chosen: underlined
// claims open quoted evidence beside the page on desktop and in the shared phone Drawer.
// The fictional in-memory fixtures illustrate the design, not a persisted wiki workflow.
import { useRef, useState, type ReactNode } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { Button } from './parts/button.tsx';
import { DrawerRoot, DrawerContent, DrawerTitle } from './parts/drawer.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';
import { Icon } from './icons.tsx';

// ---------------------------------------------------------------------------------------------------
// The model under test

type EventId = string;
type SourceId = string;
type ClaimId = string;

type HistoryEvent = { id: EventId; at: string } & (
  | { type: 'utterance'; text: string; input: 'voice' | 'typed'; context: { where?: string } }
  | { type: 'search'; query: string }
  | { type: 'wiki-change' }
);

type Source = {
  id: SourceId;
  kind: 'public-record' | 'article';
  title: string;
  publisher: string;
  url: string;
  retrieved: string;
  hash: string;
  text: string;
  foundBy: EventId;
};

type Anchor =
  | { in: 'event'; event: EventId; start: number; end: number; exact: string }
  | { in: 'source'; source: SourceId; start: number; end: number; exact: string };

type Evidence = { anchor: Anchor; support: 'stated' | 'inferred'; note?: string };

type Claim = {
  type: 'claim';
  id: ClaimId;
  text: string;
  evidence: Evidence[];
  supersedes?: ClaimId;
};
type Inline = { type: 'text'; text: string } | { type: 'ref'; to: string; label: string } | Claim;
type Block = { type: 'paragraph'; content: Inline[] };
type Section = { id: string; heading: string; blocks: Block[] };
type Retracted = { claim: Claim; by: EventId; reason: string };
type WikiPage = {
  id: string;
  title: string;
  kind: string;
  lead: Inline[];
  sections: Section[];
  retracted: Retracted[];
};

// ---------------------------------------------------------------------------------------------------
// Fixtures

const events: HistoryEvent[] = [
  {
    id: 'evt_01JHX4',
    at: '2026-01-14T18:40:12+01:00',
    type: 'utterance',
    input: 'voice',
    text: "Oh and my cousin Mira called. She's still in Majorna but she's thinking about Stockholm again, she sounded pretty done with Göteborg honestly.",
    context: { where: 'Home' },
  },
  {
    id: 'evt_01K9A1',
    at: '2026-10-08T08:12:40+02:00',
    type: 'utterance',
    input: 'voice',
    text: "Had coffee with Mira this morning, she's finally settled in Stockholm. She's got the flat on Katarina Bangata now, the one with the tiny balcony. She moved up in March. Uh, and her ceramics thing is going well, she's selling at the Christmas markets again, and she's been saving for a bigger kiln before the winter markets.",
    context: { where: 'Södermalm, walking' },
  },
  {
    id: 'evt_01K9A4',
    at: '2026-10-08T08:13:03+02:00',
    type: 'search',
    query: 'Holm keramik aktiebolag Stockholm Mira Holm',
  },
  {
    id: 'evt_01K9A6',
    at: '2026-10-08T08:13:20+02:00',
    type: 'wiki-change',
  },
  {
    id: 'evt_01K9F7',
    at: '2026-10-08T21:05:31+02:00',
    type: 'utterance',
    input: 'typed',
    text: "Mira sent a photo of the kiln she wants, it's a Nabertherm Top 60. Around 40k she said.",
    context: { where: 'Home' },
  },
];

const sources: Source[] = [
  {
    id: 'src_bolag_559412',
    kind: 'public-record',
    title: 'Holm Keramik AB – company extract',
    publisher: 'Bolagsverket (Swedish Companies Registration Office)',
    url: 'https://foretagsinfo.example/559412-3381',
    retrieved: '2026-10-08T08:13:06+02:00',
    hash: 'sha256:7c41e09ab2…',
    foundBy: 'evt_01K9A4',
    text: [
      'Holm Keramik AB',
      'Organisation number: 559412-3381',
      'Registered: 2024-05-21',
      'Registered office: Stockholm municipality (changed from Göteborg 2026-04-02)',
      'Postal address: Katarina Bangata 41, 116 39 Stockholm',
      'Business description: Manufacture and sale of ceramic goods, and teaching of ceramics.',
      'Board: Mira Holm (chair), Jonas Holm (deputy)',
      'Status: Active',
    ].join('\n'),
  },
];

const eventById = new Map(events.map((e) => [e.id, e]));
const sourceById = new Map(sources.map((s) => [s.id, s]));

const textOfEvent = (id: EventId) => {
  const e = eventById.get(id);
  return e?.type === 'utterance' ? e.text : '';
};

// What the write tool does: the model quotes, the tool finds the span. It never counts characters.
function quote(at: { event: EventId } | { source: SourceId }, exact: string): Anchor {
  const text = 'event' in at ? textOfEvent(at.event) : (sourceById.get(at.source)?.text ?? '');
  const start = text.indexOf(exact);
  if (start < 0) throw new Error(`Quote not found: ${exact}`);
  return 'event' in at
    ? { in: 'event', event: at.event, start, end: start + exact.length, exact }
    : { in: 'source', source: at.source, start, end: start + exact.length, exact };
}
const said = (
  event: EventId,
  exact: string,
  support: Evidence['support'] = 'stated',
  note?: string,
): Evidence => ({
  anchor: quote({ event }, exact),
  support,
  note,
});
const record = (
  source: SourceId,
  exact: string,
  support: Evidence['support'] = 'stated',
  note?: string,
): Evidence => ({
  anchor: quote({ source }, exact),
  support,
  note,
});

const t = (text: string): Inline => ({ type: 'text', text });
const c = (id: ClaimId, text: string, evidence: Evidence[], supersedes?: ClaimId): Claim => ({
  type: 'claim',
  id,
  text,
  evidence,
  supersedes,
});

const SRC = 'src_bolag_559412';

const page: WikiPage = {
  id: 'mira-holm',
  title: 'Mira Holm',
  kind: 'person',
  lead: [
    t('Mira Holm is '),
    c('c-cousin', "Jim's cousin", [said('evt_01JHX4', 'my cousin Mira')]),
    t(', a ceramicist who '),
    c('c-lead-sthlm', 'moved to Stockholm this year', [
      said('evt_01K9A1', "she's finally settled in Stockholm"),
      said('evt_01K9A1', 'She moved up in March.'),
    ]),
    t('.'),
  ],
  sections: [
    {
      id: 'home',
      heading: 'Home',
      blocks: [
        {
          type: 'paragraph',
          content: [
            c(
              'c-home',
              'She lives on Södermalm, in a flat on Katarina Bangata with a small balcony.',
              [
                said(
                  'evt_01K9A1',
                  "She's got the flat on Katarina Bangata now, the one with the tiny balcony.",
                ),
                record(
                  SRC,
                  'Postal address: Katarina Bangata 41, 116 39 Stockholm',
                  'inferred',
                  "Her company's postal address is on the same street, which supports the dictation. Södermalm is inferred from the street.",
                ),
              ],
              'c-home-majorna',
            ),
            t(' '),
            c('c-moved', 'She moved up from Majorna in Göteborg in March 2026,', [
              said(
                'evt_01K9A1',
                'She moved up in March.',
                'inferred',
                'The year is the year of the dictation.',
              ),
              said('evt_01JHX4', "She's still in Majorna", 'stated', 'Where she lived before.'),
              record(
                SRC,
                'Registered office: Stockholm municipality (changed from Göteborg 2026-04-02)',
                'inferred',
                'The company moved its registered office a few weeks later.',
              ),
            ]),
            t(' a move she had been considering for a long time.'),
          ],
        },
      ],
    },
    {
      id: 'work',
      heading: 'Work',
      blocks: [
        {
          type: 'paragraph',
          content: [
            c(
              'c-studio',
              'She runs Holm Keramik AB, a small studio that makes and sells ceramics and teaches classes.',
              [
                said(
                  'evt_01K9A1',
                  'her ceramics thing is going well',
                  'inferred',
                  'Identified as her company through the registry.',
                ),
                record(SRC, 'Board: Mira Holm (chair)'),
                record(SRC, 'Manufacture and sale of ceramic goods, and teaching of ceramics.'),
              ],
            ),
            t(' '),
            c('c-markets', 'Each winter she sells at the Christmas markets.', [
              said(
                'evt_01K9A1',
                "she's selling at the Christmas markets again",
                'inferred',
                '“Again” suggests a recurring thing.',
              ),
            ]),
            t(' '),
            c(
              'c-kiln',
              "She's saving for a bigger kiln, a Nabertherm Top 60, at around 40,000 kr.",
              [
                said('evt_01K9A1', "she's been saving for a bigger kiln before the winter markets"),
                said('evt_01K9F7', "it's a Nabertherm Top 60"),
                said('evt_01K9F7', 'Around 40k she said.', 'inferred', 'Kronor assumed.'),
              ],
            ),
          ],
        },
        {
          type: 'paragraph',
          content: [
            t('For anything practical with clay or glazes she is the one to ask. See also '),
            { type: 'ref', to: 'stockholm', label: 'Stockholm' },
            t('.'),
          ],
        },
      ],
    },
  ],
  retracted: [
    {
      claim: c('c-home-majorna', 'She lives in Majorna, Göteborg.', [
        said('evt_01JHX4', "She's still in Majorna"),
      ]),
      by: 'evt_01K9A6',
      reason: 'Superseded by c-home: she has moved to Stockholm.',
    },
  ],
};

// ---------------------------------------------------------------------------------------------------
// Derived indexes (what the vault would compute in memory)

const allClaims = [
  ...page.lead,
  ...page.sections.flatMap((s) => s.blocks.flatMap((b) => b.content)),
].filter((i): i is Claim => i.type === 'claim');
const claimById = new Map(allClaims.map((cl) => [cl.id, cl]));
const retractedById = new Map(page.retracted.map((r) => [r.claim.id, r]));

const evidenceKey = (a: Anchor) => (a.in === 'event' ? a.event : a.source);
/** Event or source → the claims citing it: the reverse direction, for free. */
const citedBy = new Map<string, ClaimId[]>();
for (const cl of allClaims)
  for (const ev of cl.evidence) {
    const k = evidenceKey(ev.anchor);
    citedBy.set(k, [...new Set([...(citedBy.get(k) ?? []), cl.id])]);
  }

const anchorText = (a: Anchor) =>
  a.in === 'event' ? textOfEvent(a.event) : (sourceById.get(a.source)?.text ?? '');
// ---------------------------------------------------------------------------------------------------
// Selected claim and evidence presentation

const time = (at: string) => at.slice(11, 16);
const anchorValid = (a: Anchor) => anchorText(a).slice(a.start, a.end) === a.exact;

const day = (at: string) =>
  new Date(at.slice(0, 10)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

type Mark = { start: number; end: number; tone: 'event' | 'source' };

/** Exact quoted ranges remain highlighted in their source context. */
function Marked({ text, marks }: { text: string; marks: Mark[] }) {
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])].sort(
    (a, b) => a - b,
  );
  return (
    <>
      {cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1];
        const over = marks.find((m) => m.start <= from && m.end >= to);
        const piece = text.slice(from, to);
        if (!over) return <span key={from}>{piece}</span>;
        return (
          <mark
            key={from}
            className={
              over.tone === 'event'
                ? 'rounded-sm bg-people-soft px-0.5 text-people-ink'
                : 'rounded-sm bg-places-soft px-0.5 text-places-ink'
            }
          >
            {piece}
          </mark>
        );
      })}
    </>
  );
}

function SupportBadge({ support }: { support: Evidence['support'] }) {
  return (
    <span
      className={
        support === 'stated'
          ? 'rounded-full border border-border px-2 py-px text-label text-muted-foreground'
          : 'rounded-full border border-dashed border-events px-2 py-px text-label text-events-ink'
      }
    >
      {support}
    </span>
  );
}

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  const { anchor } = evidence;
  const full = anchorText(anchor);
  const mark: Mark = {
    start: anchor.start,
    end: anchor.end,
    tone: anchor.in,
  };
  if (anchor.in === 'event') {
    const e = eventById.get(anchor.event)!;
    const u = e.type === 'utterance' ? e : null;
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
          <span className="font-medium text-people-ink">
            {u?.input === 'voice' ? 'Dictation' : 'Typed'}
          </span>
          <span>
            {day(e.at)} · {time(e.at)}
          </span>
          {u?.context.where ? <span>· {u.context.where}</span> : null}
          <span className="ml-auto">
            <SupportBadge support={evidence.support} />
          </span>
        </div>
        <p className="m-0 whitespace-pre-line font-serif text-copy">
          “<Marked text={full} marks={[mark]} />”
        </p>
        {evidence.note ? (
          <p className="m-0 text-label text-muted-foreground">Agent: {evidence.note}</p>
        ) : null}
        <span className="font-mono text-label text-muted-foreground">{e.id}</span>
      </div>
    );
  }
  const s = sourceById.get(anchor.source)!;
  const search = eventById.get(s.foundBy);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
        <span className="font-medium text-places-ink">Public record</span>
        <span>{s.publisher}</span>
        <span className="ml-auto">
          <SupportBadge support={evidence.support} />
        </span>
      </div>
      <p className="m-0 whitespace-pre-line font-mono text-label leading-relaxed">
        <Marked text={full} marks={[mark]} />
      </p>
      {evidence.note ? (
        <p className="m-0 text-label text-muted-foreground">Agent: {evidence.note}</p>
      ) : null}
      <div className="flex flex-col gap-0.5 text-label text-muted-foreground">
        <a className="text-link" href={s.url} target="_blank" rel="noreferrer">
          {s.title}
        </a>
        <span>
          Snapshot {day(s.retrieved)} {time(s.retrieved)} · {s.hash}
        </span>
        {search?.type === 'search' ? <span>Found by searching “{search.query}”</span> : null}
      </div>
    </div>
  );
}

function RetractedNote({ id }: { id: ClaimId }) {
  const r = retractedById.get(id);
  if (!r) return null;
  const by = eventById.get(r.by)!;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border p-3 text-label text-muted-foreground">
      <span>
        Replaces <s>{r.claim.text}</s>
      </span>
      <span>
        {r.reason} Retracted {day(by.at)} {time(by.at)} ({by.id}).
      </span>
    </div>
  );
}

/** Prose renderer: a switch over block and inline types, no Markdown involved. */
function Prose({ content, render }: { content: Inline[]; render: (claim: Claim) => ReactNode }) {
  return (
    <>
      {content.map((i, index) =>
        i.type === 'text' ? (
          <span key={JSON.stringify(content.slice(0, index + 1))}>{i.text}</span>
        ) : i.type === 'ref' ? (
          <a key={i.to} className="text-link" href={`#/${i.to}/`}>
            {i.label}
          </a>
        ) : (
          <span key={i.id}>{render(i)}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------
function UncitedToggle({ on, set }: { on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-label text-muted-foreground">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      Mark uncited text
    </label>
  );
}

const uncitedClass = (on: boolean) =>
  on
    ? '[&>span:not(:has([data-claim]))]:text-muted-foreground/60 [&>span:not(:has([data-claim]))]:italic'
    : '';

function StatePanel({ selected }: { selected?: ClaimId }) {
  const claim = selected
    ? (claimById.get(selected) ?? retractedById.get(selected)?.claim)
    : undefined;
  return (
    <details className="rounded-lg border border-border bg-surface p-3 text-label">
      <summary className="cursor-pointer text-muted-foreground">
        Prototype state · selected {selected ?? '—'}
      </summary>
      <pre className="mt-2 max-h-80 overflow-auto font-mono text-label whitespace-pre-wrap">
        {claim
          ? JSON.stringify(
              {
                ...claim,
                evidence: claim.evidence.map((e) => ({ ...e, valid: anchorValid(e.anchor) })),
                citedTogetherWith: [
                  ...new Set(
                    claim.evidence.flatMap((e) => citedBy.get(evidenceKey(e.anchor)) ?? []),
                  ),
                ],
              },
              null,
              2,
            )
          : `${allClaims.length} claims, ${allClaims.reduce((n, cl) => n + cl.evidence.length, 0)} anchors, all valid: ${allClaims.every((cl) => cl.evidence.every((e) => anchorValid(e.anchor)))}`}
      </pre>
    </details>
  );
}

// Variant A: side panel

function EvidencePanel({ claim }: { claim: Claim }) {
  return (
    <>
      <p className="m-0 font-serif text-copy">{claim.text}</p>
      {claim.evidence.map((e) => (
        <EvidenceCard key={`${evidenceKey(e.anchor)}:${e.anchor.start}`} evidence={e} />
      ))}
      {claim.supersedes ? <RetractedNote id={claim.supersedes} /> : null}
    </>
  );
}

const panelHeading = 'Why the page says this';

/** Desktop: the evidence panel beside the page. Compact: the same panel in the shared drawer. */
function VariantA() {
  const mobile = useLayout() === 'compact';
  const [selected, setSelected] = useState<ClaimId | undefined>(mobile ? undefined : 'c-home');
  const opener = useRef<HTMLButtonElement | null>(null);
  const [uncited, setUncited] = useState(false);
  const claim = selected ? claimById.get(selected) : undefined;
  const render = (cl: Claim) => (
    <button
      data-claim=""
      type="button"
      onClick={(event) => {
        opener.current = event.currentTarget;
        setSelected(cl.id);
      }}
      className={
        selected === cl.id
          ? 'text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer rounded-sm bg-people-soft decoration-people underline decoration-2 underline-offset-4'
          : 'text-left outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer underline decoration-border decoration-dotted decoration-2 underline-offset-4 hover:decoration-people'
      }
    >
      {cl.text}
    </button>
  );
  return (
    <div className="flex w-full flex-col gap-8 px-[var(--page-inset)] py-[var(--page-block)] md:flex-row md:gap-10">
      <article className="mx-auto flex w-full min-w-0 max-w-[var(--reading-width)] flex-1 flex-col gap-5">
        <header className="flex flex-col gap-2">
          <span className="text-label text-muted-foreground">Person · updated 8 Oct 21:05</span>
          <h1 className="m-0 font-serif text-display">{page.title}</h1>
          <p className={`m-0 font-serif text-lead ${uncitedClass(uncited)}`}>
            <Prose content={page.lead} render={render} />
          </p>
          <UncitedToggle on={uncited} set={setUncited} />
        </header>
        {page.sections.map((s) => (
          <section key={s.id} className="flex flex-col gap-3">
            <h2 className="m-0 text-title">{s.heading}</h2>
            {s.blocks.map((b) => (
              <p
                key={JSON.stringify(b.content)}
                className={`m-0 font-serif text-lead ${uncitedClass(uncited)}`}
              >
                <Prose content={b.content} render={render} />
              </p>
            ))}
          </section>
        ))}
        <StatePanel selected={selected} />
      </article>
      <DrawerRoot
        open={!!claim}
        modal={mobile}
        disablePointerDismissal={!mobile}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <DrawerContent
          inline={true}
          arrangement="panel"
          compact={mobile}
          data-layout={mobile ? 'compact' : 'wide'}
          role={mobile ? 'dialog' : 'complementary'}
          aria-label={panelHeading}
          aria-describedby={undefined}
          finalFocus={() => opener.current}
          initialFocus={mobile}
          className="kit-evidence-panel"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-4 pb-3 md:px-0 md:pt-0">
            <DrawerTitle className="text-label font-medium uppercase tracking-wide text-muted-foreground">
              {panelHeading}
            </DrawerTitle>
            <Button
              variant="ghost"
              size="standard"
              iconOnly={true}
              aria-label={`Close ${panelHeading.toLowerCase()}`}
              onClick={() => setSelected(undefined)}
            >
              <Icon name="close" />
            </Button>
          </div>
          <ScrollArea grow={true}>
            <div className="flex flex-col gap-3 px-4 pb-6 md:px-0 md:pb-0">
              {claim ? <EvidencePanel claim={claim} /> : null}
            </div>
          </ScrollArea>
        </DrawerContent>
      </DrawerRoot>
      {!(mobile || claim) ? (
        <aside className="flex shrink-0 flex-col gap-3 md:w-[340px]">
          <p className="m-0 text-label text-muted-foreground">
            Select an underlined statement to see where it came from.
          </p>
        </aside>
      ) : null}
    </div>
  );
}

/** Selected evidence reference; retired URL alternatives intentionally resolve to this design. */
export function ProvenancePrototype() {
  return <VariantA />;
}

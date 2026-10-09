// PROTOTYPE, throwaway (branch prototype/wiki-provenance). Question: how should claim-level
// provenance read on a curated prose wiki page? Three variants of /prototype/provenance/, switchable
// via ?variant=A|B|C (← → keys or the bottom bar). All data is fictional and in memory.
//   A  Side panel: claims are quietly underlined; selecting one opens its evidence beside the page.
//      DECIDED: A on desktop; on mobile the same panel opens in the kit's one drawer (Drawer),
//      matching Navigation and Settings. A right-side sheet was tried and rejected: nothing else in the
//      app slides in from the side on mobile.
//   B  Sidenotes: numbered claims with their quoted evidence always visible in the margin.
//   C  Trace: the page beside the history log; claims and events highlight each other both ways.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useIsMobile } from './hooks/use-mobile.ts';
import { Drawer } from './drawer.tsx';

// ---------------------------------------------------------------------------------------------------
// The model under test

type EventId = string;
type SourceId = string;
type ClaimId = string;

type HistoryEvent = { id: EventId; at: string; session: string } & (
  | {
      type: 'utterance';
      text: string;
      input: 'voice' | 'typed';
      transcript?: string;
      context: { device?: string; where?: string; weather?: string };
    }
  | { type: 'reply'; text: string; model: string }
  | { type: 'interpretation'; about: EventId[]; summary: string; topics: string[] }
  | { type: 'search'; query: string; results: { url: string; title: string }[]; kept: SourceId[] }
  | { type: 'source'; source: SourceId }
  | { type: 'wiki-change'; basedOn: EventId[]; page: string; ops: string[] }
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
    session: 's_0114',
    type: 'utterance',
    input: 'voice',
    text: "Oh and my cousin Mira called. She's still in Majorna but she's thinking about Stockholm again, she sounded pretty done with Göteborg honestly.",
    context: { device: 'phone', where: 'Home' },
  },
  {
    id: 'evt_01K9A1',
    at: '2026-10-08T08:12:40+02:00',
    session: 's_1008a',
    type: 'utterance',
    input: 'voice',
    transcript:
      "had coffee with mira this morning she's finally settled in stockholm she's got the flat on katarina bangata now the one with the tiny balcony she moved up in march uh and her ceramics thing is going well she's selling at the christmas markets again and she's been saving for a bigger kiln before the winter markets",
    text: "Had coffee with Mira this morning, she's finally settled in Stockholm. She's got the flat on Katarina Bangata now, the one with the tiny balcony. She moved up in March. Uh, and her ceramics thing is going well, she's selling at the Christmas markets again, and she's been saving for a bigger kiln before the winter markets.",
    context: { device: 'phone', where: 'Södermalm, walking', weather: '9°, overcast' },
  },
  {
    id: 'evt_01K9A2',
    at: '2026-10-08T08:12:52+02:00',
    session: 's_1008a',
    type: 'reply',
    model: 'gpt-6-astra',
    text: "Good to hear she's settled. I'll update Mira's page.",
  },
  {
    id: 'evt_01K9A3',
    at: '2026-10-08T08:12:55+02:00',
    session: 's_1008a',
    type: 'interpretation',
    about: ['evt_01K9A1'],
    summary: 'Coffee with Mira; she has moved to Stockholm and her ceramics studio is growing.',
    topics: ['mira-holm', 'stockholm'],
  },
  {
    id: 'evt_01K9A4',
    at: '2026-10-08T08:13:03+02:00',
    session: 's_1008a',
    type: 'search',
    query: 'Holm keramik aktiebolag Stockholm Mira Holm',
    results: [
      {
        url: 'https://foretagsinfo.example/559412-3381',
        title: 'Holm Keramik AB – företagsinformation',
      },
      {
        url: 'https://markets.example/julmarknad-2025/utstallare',
        title: 'Julmarknad 2025 – utställare',
      },
      { url: 'https://keramik.example/holm', title: 'Holm Keramik – kurser i drejning' },
    ],
    kept: ['src_bolag_559412'],
  },
  {
    id: 'evt_01K9A5',
    at: '2026-10-08T08:13:06+02:00',
    session: 's_1008a',
    type: 'source',
    source: 'src_bolag_559412',
  },
  {
    id: 'evt_01K9A6',
    at: '2026-10-08T08:13:20+02:00',
    session: 's_1008a',
    type: 'wiki-change',
    basedOn: ['evt_01K9A1', 'evt_01K9A5'],
    page: 'mira-holm',
    ops: [
      'Home: retract c-home-majorna (superseded by c-home)',
      'Home: add c-home, c-moved',
      'Work: add c-studio, c-markets, c-kiln',
    ],
  },
  {
    id: 'evt_01K9F7',
    at: '2026-10-08T21:05:31+02:00',
    session: 's_1008b',
    type: 'utterance',
    input: 'typed',
    text: "Mira sent a photo of the kiln she wants, it's a Nabertherm Top 60. Around 40k she said.",
    context: { device: 'laptop', where: 'Home' },
  },
  {
    id: 'evt_01K9F8',
    at: '2026-10-08T21:05:40+02:00',
    session: 's_1008b',
    type: 'wiki-change',
    basedOn: ['evt_01K9F7'],
    page: 'mira-holm',
    ops: ['Work: revise c-kiln (add model and price)'],
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
const anchorValid = (a: Anchor) => anchorText(a).slice(a.start, a.end) === a.exact;

// ---------------------------------------------------------------------------------------------------
// Shared presentation pieces (layouts differ per variant)

const time = (at: string) => at.slice(11, 16);
const day = (at: string) =>
  new Date(at.slice(0, 10)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

type Mark = { start: number; end: number; tone: 'event' | 'source' | 'faint' };

/** Text with highlighted spans; overlapping marks resolve to the strongest tone. */
function Marked({ text, marks }: { text: string; marks: Mark[] }) {
  const cuts = [...new Set([0, text.length, ...marks.flatMap((m) => [m.start, m.end])])].sort(
    (a, b) => a - b,
  );
  const rank = { faint: 1, source: 2, event: 2 } as const;
  return (
    <>
      {cuts.slice(0, -1).map((from, i) => {
        const to = cuts[i + 1];
        const over = marks
          .filter((m) => m.start <= from && m.end >= to)
          .sort((a, b) => rank[b.tone] - rank[a.tone])[0];
        const piece = text.slice(from, to);
        if (!over) return <span key={from}>{piece}</span>;
        return (
          <mark
            key={from}
            className={
              over.tone === 'event'
                ? 'rounded-sm bg-people-soft px-0.5 text-people-ink'
                : over.tone === 'source'
                  ? 'rounded-sm bg-places-soft px-0.5 text-places-ink'
                  : 'bg-transparent text-inherit underline decoration-people/40 decoration-2 underline-offset-4'
            }
          >
            {piece}
          </mark>
        );
      })}
    </>
  );
}

/** A window of `text` around a span, cut at word boundaries. */
function around(text: string, start: number, end: number, size = 70) {
  let from = Math.max(0, start - size);
  let to = Math.min(text.length, end + size);
  if (from > 0) from = text.indexOf(' ', from) + 1 || from;
  if (to < text.length) to = text.lastIndexOf(' ', to) || to;
  return {
    text: `${from > 0 ? '… ' : ''}${text.slice(from, to)}${to < text.length ? ' …' : ''}`,
    shift: from > 0 ? from - 2 : 0,
  };
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

function EvidenceCard({ evidence, compact = false }: { evidence: Evidence; compact?: boolean }) {
  const { anchor } = evidence;
  const full = anchorText(anchor);
  const shown = compact ? around(full, anchor.start, anchor.end) : { text: full, shift: 0 };
  const mark: Mark = {
    start: anchor.start - shown.shift,
    end: anchor.end - shown.shift,
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
          “<Marked text={shown.text} marks={[mark]} />”
        </p>
        {evidence.note ? (
          <p className="m-0 text-label text-muted-foreground">Agent: {evidence.note}</p>
        ) : null}
        {!compact ? (
          <span className="font-mono text-label text-muted-foreground">{e.id}</span>
        ) : null}
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
        <Marked text={shown.text} marks={[mark]} />
      </p>
      {evidence.note ? (
        <p className="m-0 text-label text-muted-foreground">Agent: {evidence.note}</p>
      ) : null}
      {!compact ? (
        <div className="flex flex-col gap-0.5 text-label text-muted-foreground">
          <a className="text-link" href={s.url} target="_blank" rel="noreferrer">
            {s.title}
          </a>
          <span>
            Snapshot {day(s.retrieved)} {time(s.retrieved)} · {s.hash}
          </span>
          {search?.type === 'search' ? <span>Found by searching “{search.query}”</span> : null}
        </div>
      ) : null}
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

type Hover = { claim?: ClaimId; evidence?: string };

/** Prose renderer: a switch over block and inline types, no Markdown involved. */
function Prose({ content, render }: { content: Inline[]; render: (claim: Claim) => ReactNode }) {
  return (
    <>
      {content.map((i, n) =>
        i.type === 'text' ? (
          <span key={n}>{i.text}</span>
        ) : i.type === 'ref' ? (
          <a key={n} className="text-link" href={`#/${i.to}/`}>
            {i.label}
          </a>
        ) : (
          <span key={i.id}>{render(i)}</span>
        ),
      )}
    </>
  );
}

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

function StatePanel({ selected, hover }: { selected?: ClaimId; hover: Hover }) {
  const claim = selected
    ? (claimById.get(selected) ?? retractedById.get(selected)?.claim)
    : undefined;
  return (
    <details className="rounded-lg border border-border bg-surface p-3 text-label">
      <summary className="cursor-pointer text-muted-foreground">
        Prototype state · selected {selected ?? '—'} · hover {hover.claim ?? hover.evidence ?? '—'}
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

// ---------------------------------------------------------------------------------------------------
// Variant A: side panel

function EvidencePanel({ claim }: { claim: Claim }) {
  return (
    <>
      <p className="m-0 font-serif text-copy">{claim.text}</p>
      {claim.evidence.map((e, n) => (
        <EvidenceCard key={n} evidence={e} />
      ))}
      {claim.supersedes ? <RetractedNote id={claim.supersedes} /> : null}
    </>
  );
}

const panelHeading = 'Why the page says this';

/** Desktop: the evidence panel beside the page. Compact: the same panel in the shared drawer. */
function VariantA() {
  const mobile = useIsMobile();
  const [selected, setSelected] = useState<ClaimId | undefined>(mobile ? undefined : 'c-home');
  const [uncited, setUncited] = useState(false);
  const claim = selected ? claimById.get(selected) : undefined;
  const render = (cl: Claim) => (
    <span
      data-claim=""
      role="button"
      tabIndex={0}
      onClick={() => setSelected(cl.id)}
      onKeyDown={(e) => e.key === 'Enter' && setSelected(cl.id)}
      className={
        selected === cl.id
          ? 'cursor-pointer rounded-sm bg-people-soft decoration-people underline decoration-2 underline-offset-4'
          : 'cursor-pointer underline decoration-border decoration-dotted decoration-2 underline-offset-4 hover:decoration-people'
      }
    >
      {cl.text}
    </span>
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
            {s.blocks.map((b, n) => (
              <p key={n} className={`m-0 font-serif text-lead ${uncitedClass(uncited)}`}>
                <Prose content={b.content} render={render} />
              </p>
            ))}
          </section>
        ))}
        <StatePanel selected={selected} hover={{}} />
      </article>
      {mobile ? (
        <Drawer open={!!claim} onClose={() => setSelected(undefined)} title={panelHeading}>
          <div className="flex flex-col gap-3 px-4 pt-2 pb-6">
            {claim ? <EvidencePanel claim={claim} /> : null}
          </div>
        </Drawer>
      ) : (
        <aside className="flex shrink-0 flex-col gap-3 md:sticky md:top-4 md:w-[340px] md:self-start">
          {claim ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="m-0 text-label font-medium uppercase tracking-wide text-muted-foreground">
                  {panelHeading}
                </h2>
                <button
                  type="button"
                  className="text-label text-muted-foreground"
                  onClick={() => setSelected(undefined)}
                >
                  Close
                </button>
              </div>
              <EvidencePanel claim={claim} />
            </>
          ) : (
            <p className="m-0 text-label text-muted-foreground">
              Select an underlined statement to see where it came from.
            </p>
          )}
        </aside>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Variant B: sidenotes

function VariantB() {
  const [open, setOpen] = useState<ClaimId | undefined>();
  const [hover, setHover] = useState<ClaimId | undefined>();
  const numbers = new Map(allClaims.map((cl, n) => [cl.id, n + 1]));
  const render = (cl: Claim) => (
    <span
      data-claim=""
      onMouseEnter={() => setHover(cl.id)}
      onMouseLeave={() => setHover(undefined)}
      className={hover === cl.id || open === cl.id ? 'rounded-sm bg-people-soft' : ''}
    >
      {cl.text}
      <sup className="ml-0.5 font-sans text-label text-people-ink">{numbers.get(cl.id)}</sup>
    </span>
  );
  const claimsIn = (content: Inline[]) => content.filter((i): i is Claim => i.type === 'claim');
  const row = (content: Inline[], key?: number) => (
    <div
      key={key}
      className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,var(--reading-width))_300px] md:gap-8"
    >
      <p className="m-0 font-serif text-lead">
        <Prose content={content} render={render} />
      </p>
      <ol className="m-0 flex list-none flex-col gap-3 border-l border-border p-0 pl-4 md:pl-5">
        {claimsIn(content).map((cl) => (
          <li
            key={cl.id}
            onMouseEnter={() => setHover(cl.id)}
            onMouseLeave={() => setHover(undefined)}
            className={`flex flex-col gap-1.5 text-label ${hover === cl.id ? 'opacity-100' : 'opacity-80'}`}
          >
            <button
              type="button"
              className="flex items-baseline gap-2 text-left"
              onClick={() => setOpen(open === cl.id ? undefined : cl.id)}
            >
              <span className="font-medium text-people-ink">{numbers.get(cl.id)}</span>
              <span className="text-muted-foreground">
                {cl.evidence
                  .map((e) =>
                    e.anchor.in === 'event'
                      ? `${day(eventById.get(e.anchor.event)!.at)} dictation`
                      : 'public record',
                  )
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(' + ')}
                {cl.evidence.some((e) => e.support === 'inferred') ? ' · partly inferred' : ''}
              </span>
            </button>
            {open === cl.id ? (
              <div className="flex flex-col gap-2">
                {cl.evidence.map((e, n) => (
                  <EvidenceCard key={n} evidence={e} compact />
                ))}
                {cl.supersedes ? <RetractedNote id={cl.supersedes} /> : null}
              </div>
            ) : (
              cl.evidence.map((e, n) => (
                <span
                  key={n}
                  className={`border-l-2 pl-2 font-serif italic ${e.anchor.in === 'event' ? 'border-people' : 'border-places'}`}
                >
                  “{e.anchor.exact}”
                </span>
              ))
            )}
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div className="mx-auto flex w-full max-w-[calc(var(--reading-width)+340px)] flex-col gap-6 px-[var(--page-inset)] py-[var(--page-block)]">
      <header className="flex flex-col gap-2">
        <span className="text-label text-muted-foreground">
          Person · {allClaims.length} sourced statements
        </span>
        <h1 className="m-0 font-serif text-display">{page.title}</h1>
      </header>
      {row(page.lead)}
      {page.sections.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          <h2 className="m-0 text-title">{s.heading}</h2>
          {s.blocks.map((b, n) => row(b.content, n))}
        </section>
      ))}
      <StatePanel selected={open} hover={{ claim: hover }} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Variant C: trace (page ⇄ history)

function VariantC() {
  const [hover, setHover] = useState<Hover>({});
  const [pinned, setPinned] = useState<ClaimId | undefined>();
  const [uncited, setUncited] = useState(true);
  const active = pinned ?? hover.claim;
  const activeClaim = active ? claimById.get(active) : undefined;
  const lit = new Set(hover.evidence ? (citedBy.get(hover.evidence) ?? []) : []);
  const render = (cl: Claim) => {
    const kinds = new Set(cl.evidence.map((e) => e.anchor.in));
    return (
      <span
        data-claim=""
        role="button"
        tabIndex={0}
        onMouseEnter={() => setHover({ claim: cl.id })}
        onMouseLeave={() => setHover({})}
        onClick={() => setPinned(pinned === cl.id ? undefined : cl.id)}
        className={`cursor-pointer rounded-sm transition-colors ${
          active === cl.id || lit.has(cl.id)
            ? 'bg-people-soft'
            : kinds.has('source')
              ? 'underline decoration-places/50 decoration-2 underline-offset-4'
              : 'underline decoration-people/40 decoration-2 underline-offset-4'
        }`}
      >
        {cl.text}
      </span>
    );
  };
  const marksFor = (key: string, text: string): Mark[] =>
    allClaims.flatMap((cl) =>
      cl.evidence
        .filter((e) => evidenceKey(e.anchor) === key)
        .map((e) => ({
          start: e.anchor.start,
          end: e.anchor.end,
          tone:
            cl.id === active
              ? e.anchor.in === 'event'
                ? 'event'
                : 'source'
              : ('faint' as Mark['tone']),
        }))
        .filter((m) => text.slice(m.start, m.end).length),
    );
  const isUsed = (key: string) =>
    !!activeClaim?.evidence.some((e) => evidenceKey(e.anchor) === key);
  useEffect(() => {
    const first = activeClaim?.evidence[0];
    if (first)
      document
        .getElementById(`trace-${evidenceKey(first.anchor)}`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeClaim]);
  const days = [...new Set(events.map((e) => e.at.slice(0, 10)))];
  return (
    <div className="grid w-full grid-cols-1 gap-8 px-[var(--page-inset)] py-[var(--page-block)] md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <article className="flex min-w-0 flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 font-serif text-display">{page.title}</h1>
          <p className={`m-0 font-serif text-lead ${uncitedClass(uncited)}`}>
            <Prose content={page.lead} render={render} />
          </p>
          <div className="flex flex-wrap items-center gap-4 text-label text-muted-foreground">
            <UncitedToggle on={uncited} set={setUncited} />
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-people/60" /> dictation
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-places/70" /> public record
            </span>
            <span>
              {pinned
                ? `Pinned ${pinned} (click again to unpin)`
                : 'Hover a statement, click to pin'}
            </span>
          </div>
        </header>
        {page.sections.map((s) => (
          <section key={s.id} className="flex flex-col gap-3">
            <h2 className="m-0 text-title">{s.heading}</h2>
            {s.blocks.map((b, n) => (
              <p key={n} className={`m-0 font-serif text-lead ${uncitedClass(uncited)}`}>
                <Prose content={b.content} render={render} />
              </p>
            ))}
          </section>
        ))}
        {page.retracted.map((r) => (
          <section key={r.claim.id} className="flex flex-col gap-2">
            <h2 className="m-0 text-label font-medium uppercase tracking-wide text-muted-foreground">
              No longer true
            </h2>
            <RetractedNote id={r.claim.id} />
          </section>
        ))}
        <StatePanel selected={active} hover={hover} />
      </article>
      <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-4 md:max-h-[calc(var(--design-height,100vh)-6rem)] md:self-start md:overflow-auto">
        <h2 className="m-0 text-label font-medium uppercase tracking-wide text-muted-foreground">
          History
        </h2>
        {days.map((d) => (
          <div key={d} className="flex flex-col gap-2">
            <span className="text-label font-medium">{day(d)}</span>
            {events
              .filter((e) => e.at.startsWith(d))
              .map((e) => {
                const used = isUsed(e.id);
                const enter = () => setHover({ evidence: e.id });
                const leave = () => setHover({});
                const frame = `flex flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  used ? 'border-people bg-card' : 'border-border bg-card'
                }`;
                const head = (label: string, tone = 'text-muted-foreground') => (
                  <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
                    <span className="font-mono">{time(e.at)}</span>
                    <span className={`font-medium ${tone}`}>{label}</span>
                    {citedBy.get(e.id)?.length ? (
                      <span className="ml-auto">cited by {citedBy.get(e.id)!.length}</span>
                    ) : null}
                  </div>
                );
                if (e.type === 'utterance')
                  return (
                    <div
                      key={e.id}
                      id={`trace-${e.id}`}
                      className={frame}
                      onMouseEnter={enter}
                      onMouseLeave={leave}
                    >
                      {head(
                        `Jim · ${e.input}${e.context.where ? ` · ${e.context.where}` : ''}`,
                        'text-people-ink',
                      )}
                      <p className="m-0 font-serif text-copy">
                        <Marked text={e.text} marks={marksFor(e.id, e.text)} />
                      </p>
                      {e.transcript ? (
                        <details className="text-label text-muted-foreground">
                          <summary className="cursor-pointer">Raw transcript</summary>
                          <p className="m-0 mt-1 font-mono">{e.transcript}</p>
                        </details>
                      ) : null}
                    </div>
                  );
                if (e.type === 'source') {
                  const s = sourceById.get(e.source)!;
                  const u = isUsed(s.id);
                  return (
                    <div
                      key={e.id}
                      id={`trace-${s.id}`}
                      className={`flex flex-col gap-1 rounded-lg border p-3 ${u ? 'border-places bg-card' : 'border-border bg-card'}`}
                      onMouseEnter={() => setHover({ evidence: s.id })}
                      onMouseLeave={leave}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-label text-muted-foreground">
                        <span className="font-mono">{time(e.at)}</span>
                        <span className="font-medium text-places-ink">Public record saved</span>
                        <span className="ml-auto">cited by {citedBy.get(s.id)?.length ?? 0}</span>
                      </div>
                      <span className="text-label">
                        {s.title} · {s.publisher}
                      </span>
                      <p className="m-0 whitespace-pre-line font-mono text-label leading-relaxed">
                        <Marked text={s.text} marks={marksFor(s.id, s.text)} />
                      </p>
                    </div>
                  );
                }
                if (e.type === 'reply')
                  return (
                    <div key={e.id} className="flex gap-2 px-3 text-label text-muted-foreground">
                      <span className="font-mono">{time(e.at)}</span>
                      <span>Agent: {e.text}</span>
                    </div>
                  );
                if (e.type === 'interpretation')
                  return (
                    <div key={e.id} className="flex gap-2 px-3 text-label text-muted-foreground">
                      <span className="font-mono">{time(e.at)}</span>
                      <span>
                        Understood: {e.summary}{' '}
                        <span className="font-mono">[{e.topics.join(', ')}]</span>
                      </span>
                    </div>
                  );
                if (e.type === 'search')
                  return (
                    <div
                      key={e.id}
                      className="flex flex-col gap-1 px-3 text-label text-muted-foreground"
                    >
                      <div className="flex gap-2">
                        <span className="font-mono">{time(e.at)}</span>
                        <span>Searched “{e.query}”</span>
                      </div>
                      <ul className="m-0 flex list-none flex-col gap-0.5 p-0 pl-12">
                        {e.results.map((r) => (
                          <li
                            key={r.url}
                            className={
                              e.kept.length && r.url === sourceById.get(e.kept[0])?.url
                                ? 'text-places-ink'
                                : ''
                            }
                          >
                            {r.url === sourceById.get(e.kept[0])?.url ? '✓ kept · ' : '· '}
                            {r.title}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                return (
                  <div
                    key={e.id}
                    className="flex flex-col gap-1 rounded-lg bg-muted px-3 py-2 text-label text-muted-foreground"
                  >
                    <div className="flex gap-2">
                      <span className="font-mono">{time(e.at)}</span>
                      <span className="font-medium text-foreground">Updated {page.title}</span>
                      <span className="ml-auto">from {e.basedOn.join(', ')}</span>
                    </div>
                    {e.ops.map((op) => (
                      <span key={op} className="pl-12 font-mono">
                        {op}
                      </span>
                    ))}
                  </div>
                );
              })}
          </div>
        ))}
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------
// Switcher

const variants = [
  { key: 'A', name: 'Side panel · drawer on mobile', View: VariantA },
  { key: 'B', name: 'Sidenotes', View: VariantB },
  { key: 'C', name: 'Trace', View: VariantC },
];

function useVariant() {
  const read = () => {
    const v = new URLSearchParams(location.search).get('variant');
    return Math.max(
      0,
      variants.findIndex((x) => x.key === v),
    );
  };
  const [index, setIndex] = useState(read);
  const set = (i: number) => {
    const next = (i + variants.length) % variants.length;
    const url = new URL(location.href);
    url.searchParams.set('variant', variants[next].key);
    history.replaceState(history.state, '', url);
    setIndex(next);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') set(index - 1);
      if (e.key === 'ArrowRight') set(index + 1);
    };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  });
  return [index, set] as const;
}

export function ProvenancePrototype() {
  const [index, set] = useVariant();
  const { View } = variants[index];
  const showBar = useMemo(() => import.meta.env.MODE !== 'production', []);
  return (
    <>
      <View />
      {showBar ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-2 py-1 text-label text-background shadow-lg">
          <button
            type="button"
            className="rounded-full px-2 py-1 hover:bg-background/15"
            onClick={() => set(index - 1)}
            aria-label="Previous variant"
          >
            ←
          </button>
          <span className="px-2">
            {variants[index].key} ({variants[index].name})
          </span>
          <button
            type="button"
            className="rounded-full px-2 py-1 hover:bg-background/15"
            onClick={() => set(index + 1)}
            aria-label="Next variant"
          >
            →
          </button>
        </div>
      ) : null}
    </>
  );
}

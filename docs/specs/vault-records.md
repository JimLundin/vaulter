# Vault records: specification

Status: record contract. Wiki, Chat, Questions, Agent and Content own their implemented definitions; remaining
record kinds await their modules.

Every record kind is the data one component renders: its payload is that component's props, and its
structure (placement and connection) is what the component's container resolves. Each kind has one
owning module, which ships its component and owns every write to it. Until a module exists, its
schemas live in `app/vault/records/<module>.ts`. A module claims its kinds and owns their future
design; it can evolve payloads, structure and presentation as its behavior develops. Changed required
fields or meanings need explicit historical decoders and, where needed, appended upgrade transactions.
Existing versions remain readable, including through exact addresses and historical selections.

Vault-owned translation targets each module's current validation. Source paths, formats, frontmatter
and transcript markers belong to that translation, rather than constraining Vaulter's record design.
Published history is preserved; its readability does not freeze the shapes of future writes.
See [ADR 0007](../adr/0007-vault-owned-translation.md).

## Modelling rules

- **A node is the unit that changes, is referenced or is attributed independently.** Fields that
  always change together share a node; anything that changes, is cited or is authored on its own is
  a node of its own. A version holds the node's complete state; history compares versions.
- **One fact, one place.** Sibling order is placement `order`. An unresolved reference is a null
  `connection`, and the node's text or label says what it named. A fact derivable from structure (a question
  being answered) is not also a field.
- **References are structural.** Never a name or identity inside `data`.
- **Who and when belong to the transaction.** Records carry no `changedAt` or `changedBy` fields.
- **Lifecycle records are never deleted.** Tasks complete or are abandoned, questions are answered
  or abandoned, decisions are superseded. Deletion is for structure: a block removed from a page.
- **Nothing invented.** Where the source does not establish a time's precision, the record says so.
- **Kind names are single lower-case words.**

```ts
type Instant = string;                 // ISO 8601 with offset
type LocalDate = string;               // YYYY-MM-DD, YYYY-MM or YYYY: as precise as known
/** How exactly a time is known; components format the time to this precision. */
type Precision = 'second' | 'minute' | 'day' | 'approximate';
```

## Modules

| Module | Kinds | Components |
| --- | --- | --- |
| Wiki | `page`; blocks `section`, `heading`, `paragraph`, `list`, `item`, `quote`, `table`, `row`, `cell`, `code`, `chart`, `rule`; inline `run`, `link`, `cite` | `PageView`, `PagePreview`, one component per block and inline kind |
| Graph | `relationship`, `term`; block `query` | `RelationList`, `TermChip`, `QueryBlock` |
| Calendar | `date`; block `timeline` | `DateBadge`, `CalendarView`, `TimelineBlock` |
| Tasks | `task` | `TaskItem`, `TaskList` |
| Questions | `question` | `QuestionItem`, `QuestionList` |
| Decisions | `decision` | `DecisionItem`, `DecisionLog` |
| References | `resource` | `ResourceLink` |
| Places | fields on `page` | `MapView` |
| Chat | `conversation`, `exchange`, `message`, `reference`, `observation`, … | existing feed, `ObservationChip` |
| Identities | `actor`, `agent` | `Avatar` |

A block or record owned by another module renders with that module's component, supplied by
Product; Wiki never imports it. Workflows never import each other. Migration explicitly composes
the owning modules' validators and source readers.

## Wiki

A page is a container of blocks; blocks that hold text are containers of inline nodes. An edit
versions only the node it changes: a word versions its run, a retargeted link its link, a new
source one cite.

`app/workflows/wiki/records.ts` owns these definitions and containment. Wiki also owns historical
selection validation, evidence preparation, collection reading and rendering. Only actual `page`
records enter its collection and queries. Flat `content` records retain their independent ownership
and may be cited without becoming Wiki pages.

```ts
type Page = {
  kind: 'page';
  title: string;
  summary?: string;                    // one line, readable out of context
  aliases?: string[];                  // other names it is found by
  created?: LocalDate;
  geo?: { lat: number; lon: number; precision?: 'street' };   // Places
  address?: string;                                           // Places
};

// Blocks: children of a page or a section, in placement order.
type Section   = { kind: 'section' };                // first child a heading, then blocks; depth is its level
type Heading   = { kind: 'heading' };                // inline container
type Paragraph = { kind: 'paragraph' };              // inline container
type List      = { kind: 'list'; ordered: boolean }; // contains items
type Item      = { kind: 'item' };                   // its first paragraph's inline nodes, then blocks
type Quote     = { kind: 'quote' };                  // contains blocks
type Table     = { kind: 'table' };                  // contains rows; the first row is the header
type Row       = { kind: 'row' };                    // contains cells
type Cell      = { kind: 'cell'; align?: 'left' | 'center' | 'right' };   // inline container
type Code      = { kind: 'code'; language?: string; text: string };
type Chart     = { kind: 'chart'; chart: 'line' | 'bar'; title: string; unit?: string;
                   x: string[]; series: { name: string; values: number[] }[] };
type Rule      = { kind: 'rule' };

// Inline nodes: children of a heading, paragraph, item or cell, in placement order.
type Mark = 'strong' | 'emphasis' | 'code' | 'strike';
type Run  = { kind: 'run'; text: string; marks?: Mark[] };
/** connection: block → page, section, exchange or resource; null when unresolved. */
type Link = { kind: 'link'; text: string; marks?: Mark[] };
/** Connection: exact claim → exact source; each selection freezes its descendant snapshot. */
type Selection = { sequence: number; start: number; end: number }; // half-open UTF-16
// Existing whole-source citations remain readable.
type Cite = { kind: 'cite' }
  | { kind: 'cite'; scope: 'page'; sequence: number }
  | { kind: 'cite'; unit: 'utf16'; claim: Selection; passage: Selection };
```

Page references are `cite` children of the page with an exact target and its snapshot; they describe
provenance without supporting a statement. Statement citations are children of their selected text
node or block, including runs and links; their connection holds exact endpoints independently of
placement. Sources are retained underlying material; Wiki pages and their descendants are distilled
knowledge and serve as navigation targets, never citation or provenance targets. [ADR-0005](../adr/0005-wiki-citation-selections.md) defines historical selection semantics.

Day pages are pages titled by their date, with a Calendar `date` child. Content tools currently
create and edit independent `content` records. Future page/block editing belongs to Wiki operations.

## Graph

```ts
/** A fact about its subject. Placed under the subject; connection: subject → object.
    label: the name the source gave the object, kept only while the object is unresolved. */
type Relationship = { kind: 'relationship'; predicate: string; label?: string };
/** The vocabulary. Each term is placed under its scheme, itself a term of scheme 'scheme'. */
type Term = {
  kind: 'term';
  scheme: string;                      // 'scheme', 'type', 'tag', 'area', 'status', 'circle',
                                       // 'topic', 'predicate', 'source', 'procedure'
  key: string;
  label?: string;
  use?: string;                        // when to use it
  inverse?: string;                    // predicates: read from the object
  symmetric?: boolean;                 // predicates
};
/** A live list of pages: the old NoteList. */
type Query = { kind: 'query'; type?: string; tag?: string; sort?: 'title' | 'created' };
```

Predicates: the vocabulary's own (`part-of`, `works-on`, `about`, …) and `type`, `tag`, `where`,
`who`, `answered-by`, `supersedes`, `merged-into`, `source`, `procedure`, `hub`, `is`.

## Calendar

```ts
/** A date attached to what it is placed under: a page, task, conversation, timeline …
    where: relationship → place page. */
type Date = {
  kind: 'date';
  date: LocalDate;
  end?: LocalDate;
  repeat?: 'yearly' | 'monthly' | 'weekly';
  label?: string;                      // what the date is, when not the parent itself ("Birthday")
};
/** A dated sequence on a page: the old Timeline. Contains dates. */
type Timeline = { kind: 'timeline' };
```

## Tasks

```ts
/** Placed under what it is about; who: relationship → person page, when someone else owes it. */
type Task = { kind: 'task'; what: string; due?: LocalDate;
              status: 'open' | 'completed' | 'abandoned' };
```

## Questions

Every producer raises questions through this module: the Sweep, the check, the Agent, pages.
`app/workflows/questions/` owns validation, source reading, retained collection reading and
`QuestionItem` presentation. Product supplies that presentation to Wiki; Wiki does not decode
question status or import another workflow.

```ts
/** Placed under what it is about. Answered exactly when it has an answered-by relationship
    (→ decision, exchange, page or section). */
type Question = { kind: 'question'; text: string; abandoned?: true };
```

One Question identity is shared across contexts. Its placement identifies its primary Subject;
structural `about` relationships may attach other Subjects. An exchange can refer to the same
Question through a relationship, without copying its text or moving it away from its Subject.
Transaction origin retains where it was raised, independently of what it concerns.

`answered-by` resolves to recorded evidence. An exact target retains that node's own version when
the evidence changes or is deleted; unavailable evidence is shown as unavailable and does not
silently reopen an answered Question. An unresolved answer relationship remains visible but does
not establish an Answer. Silence, removal from an old list and a failed request are not abandonment.
Historical `abandoned: true` records remain readable; uncertain legacy outcomes need review rather
than automatic reinterpretation.

An exact exchange, page or section address does not freeze its descendants. Quoting composite
answer prose requires a separately retained snapshot and selection, following the same rule as
citations. Existing answer relationships supply no such selection; the current projection retains
their node addresses and reports changes to the addressed node. Its links open the source's context,
not an exact historical answer view.

The current module provides reading and embedded presentation. Asking and answering through Chat,
the Agent and a dedicated Questions view remain subsequent behavior to implement through this owner.

## Decisions

```ts
/** A choice made. Placed under what it is about; who: relationship → person page, when someone
    else decided; supersedes: relationship → the decision it replaces. */
type Decision = { kind: 'decision'; date: LocalDate; what: string; why?: string };
```

## References

```ts
/** A web resource linked or cited. */
type Resource = { kind: 'resource'; url: string; title?: string };
```

## Chat (implemented; changes)

Conversation names describe their subjects; occurrence dates belong to metadata. Chat reads the
complete retained collection without a date cutoff. Verbatim captures preserve their original
turns; daily accounts with no surviving transcript become Recorded summaries with no inferred
user or agent speaker.

```ts
type Conversation = {
  kind: 'conversation';
  title: string;
  createdAt: Instant;
  createdAtPrecision?: Precision;
};
type RecordedSummary = {
  kind: 'message';
  role: 'record';
  at: Instant;
  atPrecision?: Precision;
  text: string;
  record: { kind: 'summary'; label?: string };
};
type Exchange = {
  kind: 'exchange';
  startedAt: Instant;
  startedAtPrecision?: Precision;      // new
  endedAt?: Instant;                   // new
  time?: { timezone: string; offsetMinutes: number };
  summary?: string;                    // replaces capture.summary; procedure is a relationship
  preamble?: string;                   // new: text of an imported record outside its turns
};
// message: + atPrecision?: Precision
// reference: + label: string
// observation: time.requested, time.received and time.elapsedMs nullable;
//   weather.intervalSeconds nullable; new subjects:
type Host    = { host?: string; os?: string; kernel?: string; arch?: string; user?: string;
                 shell?: string; timezone?: string; node?: string };
type Session = { session?: string; entrypoint?: string; effort?: string; turns?: number };
```

A weather reading's place is its `metadataReference` with role `place`; its coordinates are the
place page's `geo`, recorded as the quality method.

## Identities (implemented)

```ts
type Actor = { kind: 'actor'; name: string };    // is: relationship → person page
type Agent = { kind: 'agent'; name: string };
```

Historical authors become identities: the owner, and agents for the Vaulter Librarian, Claude and
the Vaulter tools.

## Transactions

| Kind | Author | Time | Origin | Message | Metadata |
| --- | --- | --- | --- | --- | --- |
| `node.create` (identities) | owner | when recorded | none | | none |
| `vault.import`, one per historical change | its original author | its original time | none | its original message | none |

## Translation and enrichment

The private Vault owns the [migration tools](https://github.com/JimLundin/vault/tree/main/.vaulter/tooling/migration)
and [operational runbook](https://github.com/JimLundin/vault/blob/main/.vaulter/tooling/wiki-migration.md).
They interpret source history, choose extraction and enrichment policy, and compose the current
Vaulter record owners. New extraction can produce richer records without requiring Vaulter to
retain the source vault's organization or its original one-to-one mapping.

The tooling pins a Vaulter Git revision and imports its existing owner entries. Updating that pin
requires adapting translation and checking proposed writes against the new target definitions.
Those source imports provide no stable SDK contract. Vaulter's modules evolve for application needs.

The imported history is already published. Preserve its immutable prefix and exact addresses;
append enrichment and upgrades. Original import replay remains a scratch verification facility.
Historical decoding and citation text semantics stay with the record owners, as required by
[ADR 0002](../adr/0002-versioned-node-model.md) and [ADR 0005](../adr/0005-wiki-citation-selections.md).
See [Wiki ingestion](../wiki-migration.md) for current preparation and evidence validation.

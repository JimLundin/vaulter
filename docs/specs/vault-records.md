# Vault records: specification

Status: draft for review. Not yet claimed by modules.

Every record kind is the data one component renders: its payload is that component's props, and its
structure (placement and connection) is what the component's container resolves. Each kind has one
owning module, which ships its component and owns every write to it. Until a module exists, its
schemas live in `app/vault/records/<module>.ts` and move into the module unchanged.

The vault migration writes exactly these shapes. Nothing is kept for compatibility with the Markdown
vault: file paths, formats, frontmatter and transcript markers are not part of any record.

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
Product; Wiki never imports it. Modules never import each other.

## Wiki

A page is a container of blocks; blocks that hold text are containers of inline nodes. An edit
versions only the node it changes: a word versions its run, a retargeted link its link, a new
source one cite.

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
/** connection: block → the exact version of its source. Renders as a citation marker. */
type Cite = { kind: 'cite' };
```

Day pages are pages titled by their date, with a Calendar `date` child. The Agent's content tools
become Wiki operations: create a page, insert, edit, move or remove a block or inline node.

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

```ts
/** Placed under what it is about. Answered exactly when it has an answered-by relationship
    (→ decision, exchange, page or section). */
type Question = { kind: 'question'; text: string; abandoned?: true };
```

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

```ts
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

## Migration

- **Block identity across revisions.** Consecutive revisions of a page are matched block by block
  and inline node by inline node: exact text first, then the most similar text at the same position.
  A match keeps its identity and gets a version only if it changed. Ambiguous matches are reported.
- **Removed lifecycle records.** A question removed from its page is abandoned: the history does not
  point to an answer. A follow-up removed from its page keeps its state; outcomes known only now are
  recorded by the owner in a transaction of their own, after the imported history.
- **Removed pages.** A page merged into another stays, with `merged-into` to it; a removed page keeps
  its history as a removed page.
- **Verification.** Every historical revision of every page renders back to its source text's
  content; every turn is verbatim; every record parses with its module's schema.

## Running the migration

`tools/migration/migrate.ts` regenerates the vault's node history from its Git history;
`tools/migration/verify.ts` checks the result independently. Both read the vault repository next to
this one and write nothing into either repository.

```sh
npm run migrate -- --out /tmp/vault-migration         # --vault-ref origin/main by default
npm run migrate:verify -- --out /tmp/vault-migration
```

The output holds the transaction envelopes under `.vaulter/nodes/v1/transactions/`, the identity
map, the transaction-to-commit map and a report: unresolved references, values a schema rejected,
merged and removed pages, abandoned questions. Identities and transaction IDs are derived from
source anchors, so an unchanged source regenerates byte-identical envelopes.

To replace a migration, commit to the vault's `main` in one commit: remove the envelopes whose
transaction IDs start with `vault:` (or `migration:`, the first migration), add the generated ones,
and keep the application's own. Devices that synchronized the replaced history refuse it until their
cache is cleared by signing out and in.

A replacement is possible only while the application's own transactions all precede the migration:
the migrator continues their sequence and fails when later application transactions exist, since
those build on the migrated versions and cannot be rewritten.


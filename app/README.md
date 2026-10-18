# Project layout and ownership

Start in the domain that owns the behavior. Its retained definitions, operations, reading and
presentation live together. `index.ts` is the behavior entry; `presentation/index.tsx` (or `.ts`)
is the presentation entry when one exists. Implementation files stay private to their owner.

```text
app/
├── application/                 Core application
│   ├── database.ts              Compose owner definitions; open one typed database
│   ├── composition.ts           Compose domain behavior and trusted context
│   ├── store/                   Entities, Transactions, Snapshots, history, exact save retry
│   ├── persistence/             GitHub journal transport, cache and connection preferences
│   ├── session/                 Credentials, unlock, refresh and journal retirement
│   ├── settings/                Shared preference persistence and credential presentation
│   ├── history/                 Transaction inspection and History drawer
│   └── index.tsx                Navigation, global presentation and mounted owner lifetime
├── actors/                      Attribution identity and atomic account binding
├── sources/                     Source documents and recorded/current source reading
├── conversation/                Conversation, Exchanges, Messages, context and recovery
│   └── presentation/            Chat page/pane, dialogue timeline and text rendering
├── agent/                       Agent runs, Model steps, Tool executions, text/voice effects
│   ├── openai/                  Provider transport adapters and configuration
│   └── presentation/            Agent settings and recorded/live activity views
├── wiki/                        Pages, content, Appearance and Page references
│   ├── reviews/                 Review records, selection validation and admission
│   └── presentation/            Wiki pages, support views and semantic rendering
├── graph/                       Topics, membership, Relationships and vocabulary
├── questions/                   Questions, Answers, collection lifetime and save recovery
├── calendar/                    Time values, Events and recurring annual dates
├── map/                         Coordinate records and geographic values
├── transcription/               Capture lifetime and transport contract
├── search/                      Ranking, recent entries and search interaction
├── navigation/                  Routes, commands and keyboard navigation
├── ui/kit/                      Generic presentation and browser mechanics
├── runtime/                     Small independent runtime utilities
└── preview/                     Fictional records and scripted transport adapters
```

## Ownership and dependencies

Read these views in order: ownership, core services, domain connections, then Application joins.
Boxes show owners or public capabilities. In dependency diagrams, `A → B` means **A uses B**;
edge labels say what it uses. The diagrams show architectural relationships, not every import.

### 1. Ownership: where to start

The three rows are directory groups. This view has no dependency arrows. Grouping related domains
helps navigation; it does not introduce another owner above them.

```mermaid
block-beta
  columns 1
  block:core
    columns 3
    Core["CORE APPLICATION\napplication/"] Composition["Composition + database"] Lifecycle["Session + Settings"]
    space Store["Store + Transactions"] History["History + Persistence"]
  end
  block:domains
    columns 3
    Domains["DOMAIN OWNERS\nOne app/ directory each"] Dialogue["Conversation · Agent\nTranscription"] Knowledge["Wiki · Sources · Graph"]
    space Identity["Actors"] Organization["Questions · Calendar · Map"]
  end
  block:shared
    columns 3
    Shared["SHARED SUPPORT\napp/"] Interaction["Search · Navigation\nUI kit · Runtime"] Fixtures["Preview\nfictional adapters"]
  end
  style core fill:#eff6ff,stroke:#2563eb
  style domains fill:#f0fdf4,stroke:#16a34a
  style shared fill:#f8fafc,stroke:#64748b
```

### 2. Core services: one shared database

Settings, the data store, Transactions and History belong to the core application.
Domain owners define their records; `application/database.ts` combines those definitions.
The store engine remains independent of those domain schemas.

```mermaid
flowchart LR
  subgraph Core["application/ — core ownership"]
    direction LR
    Database["database.ts\nSchema composition"] -->|opens| Store["store/\nTyped database + Transactions"]
    History["history/\nTransaction inspection"] -->|reads accepted Transactions| Store
    Store -->|journal adapter| Persistence["persistence/\nGitHub journal + cache"]
    Session["session/\nUnlock + refresh + lifetime"] -->|opens and retires journal| Persistence
    Session -->|credential controls| Settings["settings/\nPreferences + credential editing"]
  end
```

Retained-record owners use the core store's public interface for queries and atomic writes.
This is a common dependency across those owners, so it is shown once here. Domain-specific
settings fields keep their meanings in their domain; core Settings owns persistence and editing.

### 3. Domain connections: execution and knowledge

These connections carry domain meaning. They belong in the consuming owner.
Conversation owns dialogue; Agent owns execution, including runs that have no Conversation.

```mermaid
flowchart LR
  Conversation["conversation/\nDialogue + recovery"] -->|starts and reads runs| Agent["agent/\nModel + tool execution"]
  Conversation -->|draft capture| Transcription["transcription/\nCapture lifetime"]
  Questions["questions/\nQuestions + Answers"] -->|answer dictation| Transcription
  Questions -->|tool presentation contract| Agent
  Agent -->|provider adapter| Transcription
```

```mermaid
flowchart LR
  Wiki["wiki/\nPages + Reviews"] -->|recorded and current source reading| Sources["sources/\nSource documents + provenance"]
```

Conversation, Agent, Wiki and Questions use `actors/` directly for shared attribution.
Application supplies trusted author references to Calendar and Map. Producers that bind an account
do so inside their own Transaction. These shared relationships are stated once to keep the diagrams legible.
Graph, Calendar and Map receive foreign-record descriptions from Application.

### 4. Application joins: where domains meet

Application supplies context and adapters through public owner interfaces. These combinations
are owned by `application/`; they do not make either domain responsible for the other's behavior.

| Application composition | Owners connected | What Application supplies |
| --- | --- | --- |
| Wiki Topics | Wiki + Graph | Topic membership for Wiki pages |
| Subject calendars | Wiki + Calendar | Subject descriptions and calendar context |
| Map choices | Map + Wiki, Calendar, Questions, Sources | Foreign record choices and descriptions |
| Question context | Questions + selected foreign records | Selected context and trusted user identity |
| Search entries | Search + searchable domain owners | Entries produced from each owner's records |
| Agent tools | Agent + tool-owning domains | Tool adapters and trusted execution context |

### 5. Inside one domain: keep the whole concept together

This is the reading path for a typical domain; specific filenames reflect its vocabulary.
Application callers use the public entries, and presentation delegates behavior to its owner.

```mermaid
flowchart LR
  Caller["Application caller"] -->|behavior API| Entry["index.ts\nPublic behavior entry"]
  View["presentation/\nOwner's UI"] -->|owner behavior| Entry
  View -->|generic controls| Kit["ui/kit/"]
  Entry -->|encapsulates| Behavior["Operations + reading\nPrivate cohesive behavior"]
  Behavior -->|owner definitions| Records["records.ts"]
  Behavior -->|queries + atomic writes| Store["application/store/\nPublic typed interface"]
```

### Ownership reference

| Module | Owns | Caller supplies |
| --- | --- | --- |
| Core store | Typed records, identity, queries, atomic Transactions, recorded history and exact publication retry | Composed owner definitions; persistence adapter |
| Core session | Unlock, credential changes, cache readiness, refresh and journal retirement | Production or fictional persistence factory |
| Core Settings | Preference persistence and safe credential editing | Owner-defined field meanings |
| Core History | Generic accepted Transaction inspection and drawer presentation | Shared database and permitted compensation context |
| Actors | Actor records and account binding inside a producer's Transaction | Trusted account identity; caller's Transaction |
| Sources | Source document records, provenance and recorded/current projection | Shared database |
| Conversation | Dialogue identity, admission, draft/capture association, Exchanges, context checkpoints and recovery | Agent execution and owner tools; trusted identities |
| Agent | Configuration snapshots, runs, supplied Context inputs, Model steps, Tool executions and effect recovery | Model/voice transport and owner tool adapters |
| Wiki | Content, containment, availability, citations and Wiki Review admission | Source reading and foreign presentation |
| Graph | Topics, membership, Relationships and exploration | Foreign record descriptions |
| Questions | Question/Answer admission, collection subscriptions and answer save recovery | Database, trusted user identity, readiness and selected foreign context |
| Calendar / Map | Their native records, value interpretation, writes and reading | Foreign subject descriptions and trusted attribution |
| Transcription | Capture connection lifetime and output identity | Transport adapter; draft association stays with its caller |
| UI kit | Shared geometry, input, focus, scrolling and generic controls | Owner presentation content |
| Preview | Fictional records and scripted adapters | Public owner interfaces and explicit test seams |

`records.ts` contains retained definitions. `configuration.ts` validates configuration;
`suggestions.ts`, `activity-data.ts`, `view.ts` and `projection.ts` name outward values and reading.
A private subfolder names cohesive behavior (`wiki/reviews`), rather than a generic `data` owner.

The core store has no knowledge of domain schemas. `application/database.ts` assembles the registry.
Actor binding stays inside the producer's atomic Transaction. Initial Exchange and Agent run
acceptance remains atomic. Save recovery republishes the exact failed request without repeating a
provider or tool effect. Directory and TypeScript names are independent of stable persisted entity
and attribute keys.

Tests sit beside the owner they exercise; cross-owner scenarios sit in `application/`.
`tools/architecture/layout.test.ts` checks public entries, dependency direction, private engine
access, presentation mechanics and fixture isolation. Use the [testing guide](../docs/agents/testing.md)
for focused local checks and CI verification.

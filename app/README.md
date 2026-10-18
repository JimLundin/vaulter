# Project layout and ownership

Start with the module that owns the concept. Core and domain modules both contain behavior,
retained definitions, reading, presentation and route declarations. Application installs their
contributions and supplies context. Shared contains generic mechanics.

```text
app/
├── main.tsx                         Production bootstrap
├── application/                     Product composition
│   ├── composition/                 Database registry, identities and cross-module joins
│   │   ├── database.ts              Assemble definitions; open one typed database
│   │   ├── composition.ts           Supply context, tools and adapters
│   │   └── wiki-graph.ts            Join Wiki pages with Graph Topics
│   ├── presentation/                Application shell and mounted module lifetime
│   │   ├── index.tsx                Register module pages and navigation contributions
│   │   ├── Frame.tsx                Supply navigation to the UI kit
│   │   └── SettingsCards.tsx        Compose owner-defined settings fields
│   └── runtime/sw.ts                Offline application asset caching
├── core/                            Core-owned modules
│   ├── store/                       Typed records, Transactions, Snapshots and exact save retry
│   ├── persistence/                 Journal transport and cache
│   │   └── presentation/            Connection preferences
│   ├── session/                     Unlock, credentials, refresh and journal lifetime
│   │   └── presentation/            Gate and session controls
│   ├── settings/                    Preference persistence and credential editing
│   │   └── presentation/            Setting fields and Settings navigation contribution
│   ├── history/                     Accepted Transaction reading and compensation
│   │   └── presentation/            History drawer, list and navigation contribution
│   ├── search/                      Ranking and recent destinations
│   │   └── presentation/            Search palette, commands and Agent handoff
│   └── navigation/                  Route contract, matching, transitions and key bindings
├── modules/                         Domain-owned modules
│   ├── actors/                      Attribution and atomic account binding; no standalone UI
│   ├── sources/                     Source documents and provenance; no standalone UI
│   ├── transcription/               Capture lifetime; caller owns draft association and UI
│   ├── conversation/                Dialogue, Exchanges, context and recovery
│   │   └── presentation/            Chat pages, pane, timeline, settings and routes
│   ├── agent/                       Runs, Model steps, tools and effect recovery
│   │   ├── openai/                  Provider adapters and configuration
│   │   └── presentation/            Settings and recorded/live activity views
│   ├── wiki/                        Pages, content, Appearance and Page references
│   │   ├── reviews/                 Review validation, admission and support reading
│   │   └── presentation/            Wiki pages, rendering, support views and routes
│   ├── graph/                       Topics, membership, Relationships and vocabulary
│   │   └── presentation/            Graph exploration and routes
│   ├── questions/                   Questions, Answers, collection lifetime and save recovery
│   │   └── presentation/            Questions, embedded Answers, tool views and routes
│   ├── calendar/                    Time values, Events and annual dates
│   │   └── presentation/            Calendar page, timeline and routes
│   ├── tasks/                       Tasks, fixed status workflow and provenance
│   │   └── presentation/            Task board, embedded cards and routes

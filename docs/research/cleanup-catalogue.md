# Cleanup catalogue

Audited on 2026-10-16 against commit `27adbb686574065445076b0f7e3ce59bb67fecb5`.
Updated on 2026-10-16: D1-D5 are complete. Seven finding groups remain for review.
Line references describe the audit baseline and can move after edits.

Completed: stale tooling paths (D1), retired branch instructions (D2), the incorrect design-review
port (D3), completed integration prose (D4), and superseded encryption/cutover instructions (D5).
The ADRs retain their decisions and clearly describe the historical context. No application code
was removed.

## Scope and evidence

The documentation audit covered all 24 tracked Markdown files, the current module map,
relevant source interfaces and runner configuration, and local Git history. All 50 relative
Markdown links resolved on disk. That check covers Markdown links, not every path inside
backticks, heading anchors or external/private GitHub URLs. GitHub issues and the private
Vault were not inspected for this documentation audit.

Recent cleanup already removed legacy file workflows (`3567103`, 2026-10-15), pruned stale
documentation and grouped tooling (`9ae52f9`, 2026-10-15), and colocated tests (`cc66636`,
2026-10-15). The remaining documentation problem is chiefly stale passages and duplicated
guidance inside maintained files. No tracked Markdown file was established as wholly obsolete.

Actions below mean: **remove** an obsolete passage, **consolidate** repeated guidance at its
owner, **keep** a current contract or useful decision record, or **investigate** evidence that
requires another repository, issue or runtime check. Confidence describes the finding, not
authorization to delete.

## Documentation candidates

| ID | Candidate | Evidence and impact | Proposed action | Confidence |
| --- | --- | --- | --- | --- |
| D6 | Architecture repeats module-level operational contracts | Conversation lifetime (`ARCHITECTURE.md:193`), detailed UI kit mechanics (`:266`), node storage (`:424`), Wiki record ownership (`:456`), and Chat presentation (`:488`) substantially overlap the maintained Chat, Vault, Wiki and kit READMEs. The architecture file also introduces Search as generic shared application UI (`:334`) while its actual owner is `app/search/Search.tsx:38`, already named in the top ownership table. | Consolidate: keep dependency graph, owner table, placement rules and cross-module seams in Architecture. Link to owner READMEs for detailed lifetimes, persisted layouts and UI APIs. State Search's named owner directly. Review paragraph by paragraph; overlapping information can still explain a cross-module seam. | Medium |
| D7 | Kit README retains a migration ledger | Removed names remain throughout current kit guidance: Dialog/CommandDialog/SettingsPage (`app/ui/kit/README.md:110`), SearchSurface (`:121`), old field/add-on designs (`:157`), StatusMark/Recording/hint variants (`:162`), ConversationPanel/AdaptivePanel (`:243`), MobileFrame (`:287`), Composer (`:566`), retired provenance prototype (`:591`), Leaflet (`:612`) and Conversation aliases (`:622`). These names have no current exports in `app/ui/kit/index.ts`. | Remove repeated lists of retired names and completed-migration narration from the current interface guide; retain current supported choices, accessibility requirements and any explicit rationale needed to prevent regressions. Git history and ADRs preserve the decisions. Keep one short warning only where a live compatibility route still exists. | High for historical wording; medium for how much to cut |
| D8 | Repeated preview and testing instructions | The command table (`README.md:11`), project edit loop (`:73`), publishing section (`:114`), kit verification section (`app/ui/kit/README.md:568`) and browser/deployment section (`ARCHITECTURE.md:376`) repeat procedures owned by `docs/agents/testing.md` and `docs/agents/preview.md`. The incorrect port and branch instructions in D2/D3 show the maintenance cost. | Consolidate common procedures in agent guides; retain README command discovery/publishing essentials and kit-specific focused-check examples. Replace repeated delivery/device/worktree policy with links to its owner. | Medium |

## Documentation to retain or investigate

| Group | Decision | Evidence |
| --- | --- | --- |
| Root agent instructions and `docs/agents/` | Keep | `AGENTS.md` directly routes agents to domain, issue, triage, testing and preview rules. Their linked files exist, and testing/preview rules match current runner and workflow organization. These are active instructions, not abandoned planning documents. |
| `GLOSSARY.md` and all nine ADRs | Keep; clarify historical status where listed above | Root domain guidance selects these as the canonical vocabulary and decisions. ADR 0003/0004/0008 form an explicit supersession/extension chain; ADR 0002/0005/0007 retain immutable-history, citation and translation boundaries. Superseded rationale remains useful evidence. |
| Chat/Agent historical-decoder documentation | Keep | `app/workflows/chat/README.md:147` documents current and older metadata layouts; `app/agent/README.md:257` preserves unknown JSON. ADR 0007 explicitly permits evolving modules while requiring historical reads. Old persisted payload support is distinct from an abandoned producer or prototype. |
| Wiki README and links to the private Vault | Keep current boundary; investigate private link validity separately | `app/workflows/wiki/README.md:3` and `:6` point to Vault-owned translation/runbook material; ADR 0007 makes that ownership intentional. Local absence of private tooling is not evidence it should be moved back or deleted. Private link destinations were not verified. |
| `docs/research/mutation-testing.md` | Keep as a dated experiment record | It records a verified pilot date, exact versions/results and primary sources (`:7`, `:37`). Current mutation scripts/configuration exist. Distinguish its baseline survivor results from subsequent reruns; update current recommendations if traversal checks change. |
| Component examples for features not used by production | Keep unless the public API is deliberately reduced | `app/ui/kit/index.ts:251`, `:269`, `:278` and `:322` still export ListDetail, Timeline, MapView and DesignComparison. The kit's catalogue coverage contract requires examples for public components. Unused-by-product examples alone do not establish dead documentation. |
| Origin references to `ui-kit`, spike commits and Safari validation | Optional consolidation, not proven dead | `ARCHITECTURE.md:317` records a source branch/commit, ADR 0002 links a captured spike (`docs/adr/0002-versioned-node-model.md:179`), and kit guidance records a physical Safari check (`app/ui/kit/README.md:415`, `:585`). Preserve useful evidence once in a dated record if removing it from current setup/API prose. |

## Code candidates

The code audit scanned 422 tracked TypeScript/TSX files for local imports, re-exports,
literal dynamic imports and type imports. HTML script entries, npm commands, CI scripts and
Vite configuration discovery were checked separately. This conservative file graph established
no orphan source file. It does not establish symbol usage: a barrel export can keep a file
reachable without any caller using that export. Computed imports and external consumers were
not exhaustively analyzed. All 30 runtime dependency names occur in tracked source/configuration;
that coarse check found no obviously abandoned package, and does not prove every package necessary.

| ID | Candidate | Evidence and impact | Proposed action | Confidence |
| --- | --- | --- | --- | --- |
| C1 | Chat's old provider exports | `app/workflows/chat/model.ts:5` exports `MODEL_KEY`; `:6` exports `DEFAULT_MODEL`; `:10` defines `openAIModel`, re-exported at `app/workflows/chat/index.tsx:12`. Repository searches found no consumers of those three names beyond their declaration/re-export. `app/agent/README.md:223` explicitly calls Chat's established provider imports compatibility delegates. The `model` alias is still called at `app/workflows/chat/Chat.tsx:73`; `ModelProvider` is still used by `app/workflows/chat/suggestions.ts:3`. | Remove the unused constants and provider wrapper/re-export after checking the pinned private Vault consumer. Keep the live model selection and suggestion provider type, or use their current Agent-owned interfaces in a focused follow-up. Do not delete the whole model module on the current evidence. | High for absence of local callers; medium for removal |
| C2 | Chat transcription compatibility entry and misplaced provider tests | `app/workflows/chat/openai-transcription.ts:1` explicitly labels itself a compatibility export of Agent's `openai/live-transcription.ts`. Its only direct repository consumer is `app/workflows/chat/openai-transcription.test.ts:3`; Chat's barrel also re-exports it at `index.tsx:13`. That test exercises WebRTC protocol, cancellation, credential redaction and microphone cleanup, rather than a Chat-specific contract. Production provider assembly imports the Agent owner directly (`app/agent/openai/index.ts:6`). | Check external consumers, then remove the shim/barrel export and move the meaningful protocol tests beside `app/agent/openai/live-transcription.ts`. Reuse existing media test support where appropriate. Preserve distinct protocol/recovery assertions rather than deleting the test file wholesale. | High for ownership finding; medium for removal |
| C3 | Unclaimed-record schema registry and validation helpers | `app/vault/records/index.ts:12` assembles graph, calendar, task, decision, reference and identity schemas. `parseVaultRecord` at `:23` is called only by `app/vault/records/records.test.ts` in this repository. The assembled schema maps likewise have no independent local consumer. However, production uses the separate `retainedRecordSources` reader (`app/application/composition.ts:22`) and `identityName`; the registry is not what makes those historical reads work. ADR 0007 says the private translator imports current owner entries from a pinned Vaulter checkout. | Investigate the private translator's imports before removing the registry and otherwise unused schema definitions in `graph.ts`, `calendar.ts`, `lifecycle.ts`, `references.ts`, `common.ts` and `identities.ts`. Keep the production readers and identity-name helper. If translation is the sole owner of validation policy, decide which validation belongs with that consumer; do not remove historical interpretation with it. | High for local usage; medium for ownership decision |
| C4 | Embedding capability without an application operation | `app/agent/openai/index.ts:86` creates and returns `embed`; `embeddings.ts` implements batching and validation. Repository searches found `capabilities.embed` calls only in `app/agent/openai/settings.test.ts:249`. Embedding defaults/preferences remain in `defaults.ts` and `settings.ts:100`; capability tests cover actual transport behavior. Search currently ranks text in `app/search/entries.ts`, with no embedding call. | Investigate whether embeddings are a current private consumer requirement or an explicitly retained feature. If neither, remove the capability, transport, settings/defaults and only its owning test cases together. The visible unused setting is a stronger cleanup concern than merely unused implementation. No package is solely attributed to embeddings on this evidence. | High for missing application caller; medium for retirement |

ADR 0007 explicitly rejects a separately stable migration SDK, so external usage does not
automatically require preserving old APIs forever. It does require checking the actual pinned
consumer before choosing a coordinated removal. This audit did not inspect that private repository
or GitHub issues; an apparently unused capability may still have an accepted specification.

## Code and local material to retain

| Group | Decision | Evidence |
| --- | --- | --- |
| Historical Chat/Agent/Wiki decoders and exact evidence reading | Keep | They are called by current record readers, and ADRs 0002, 0005 and 0007 require retained history to stay readable. Retiring a producer wrapper does not justify erasing its recorded payload meaning. |
| Legacy `/agent/` route | Keep pending an explicit route-retirement decision | `app/application/routes.ts:5` declares it and `app/application/index.tsx:288`, `:362` still dispatch it. This changes bookmark/deep-link behavior if removed; it is live compatibility behavior rather than an unreferenced symbol. |
| Legacy device model-key migration | Keep pending a support cutoff | `app/agent/openai/settings.ts:138`–`:163` reads `vault.agent.model`, saves the selected choice and removes the old key only after saving. `settings.test.ts:25` onward covers successful migration and retry after failure. Removing unused Chat constants in C1 does not require removing this user-preference recovery behavior. |
| Preview bootstraps and standalone kit config | Keep | `app/preview/record-examples.tsx` is loaded by `app/preview/records.html:1`, which is a design build entry in `vite.config.ts:63`. `app/ui/kit/vite.config.ts` is discovered by `npm run kit` / the kit build. Both initially appear unreferenced in a TypeScript-only graph. |
| Public kit specimens, comparison mechanism and browser fixtures | Keep unless deliberately reducing the supported API | The kit exports comparison, map, chart and other primitives and tests its public catalogue. Preview instructions require preserving comparisons separately after selection. A fictional specimen is not itself an obsolete experiment. |
| Build/deployment/testing tools with no TypeScript importer | Keep | npm scripts, `.github/workflows/deploy.yml`, mutation configuration and runner configuration invoke/discover them. Source-import absence alone cannot justify deleting scripts such as `seal-secrets.ts` or `publish-design.ts`. |
| `components.json` | Keep | It maps the generator to the current kit CSS, parts and aliases; `vite.config.ts:79` explicitly documents the shared source alias. Being absent from application imports is expected for generator configuration. |
| Ignored generated output: `dist/`, `dist-browser/`, `dist-preview/`, `.stryker-tmp/`, `reports/mutation/`, `test-results/`, `test-results-production/` | Optional local housekeeping, separate from tracked cleanup | `.gitignore` excludes these build/test artifacts. They are regenerable output, not tracked design guidance. Existing reports may still be useful diagnostics. `node_modules/` is also ignored but is the installed toolchain, so deleting it carries a reinstall cost. No local directories were removed. |

## Suggested order

1. Consolidate D6-D8 around current owner documents, preserving contracts and rationale while removing migration narration.
2. Check the pinned private consumer and originating issues for C1-C4. Remove locally unused Chat exports first; move provider tests with their owner. Decide schema/embedding ownership before deleting larger groups.
3. Treat route/preference retirement as an explicit behavior change, and ignored build/test output as optional local housekeeping.

This audit establishes catalogue findings through static source/configuration inspection.
The five completed groups changed documentation only. The terminal visual separates evidence
confidence from review judgement about the proposed action; ratings are qualitative assessments,
not probabilities. The unused browser visual artifacts were retired in favor of terminal views.
It does not establish full application behavior or CI verification. Any later code removal needs
focused checks at its owner and the pushed commit's CI results under `docs/agents/testing.md`.
Keep this as a temporary cleanup worksheet: remove resolved entries and retire the file after
the cleanup, leaving lasting decisions in owner documentation or ADRs.

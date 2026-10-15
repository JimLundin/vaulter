# Production design integration and branch consolidation — 2026-10-11

Production exposes node-backed Wiki pages and the selected Chat design. Wiki uses the selected
Reading first / Balanced layout with Framed reference cards and a docked References panel.
The article and supporting panel fill the app frame and scroll independently. Their headers share
48px geometry with Chat; phones use the same full-height Drawer with dismissal and focus return.

Title actions restore page references. Underlined claim selections open their reviewed sources,
with exact source passages highlighted across retained context. Formatting survives selection;
unselected prose stays uncited and ordinary links retain navigation. Reference cards expand long
context without leaving the page. Classifications resolve from stored terms and subject tags filter
the real page collection. Connections and lifecycle records remain visible.

Application uses this renderer directly in the production entry. Built production acceptance covers
Wiki navigation, UTF-16 claim/passage ranges, reference expansion, page-source reset, tag filtering,
source navigation into persistent Chat and phone focus return. Deploy CI runs unit, layout, kit and
built production checks on main before publishing to GitHub Pages. `version.json` records the
published commit. Preview builds retain sample data separately.

The underlying-source rule and module-owned evidence preparation accompany the UI projection.
Translation and enrichment now live in the private Vault's
[migration tooling](https://github.com/JimLundin/vault/tree/main/.vaulter/tooling/migration).
Private reviewed packets, publication status and handoffs belong to its
[operational runbook](https://github.com/JimLundin/vault/blob/main/.vaulter/tooling/wiki-migration.md).
Prepared enrichment requires its exact recorded baseline or regeneration if vault history advances;
[Wiki ingestion](wiki-migration.md) describes Vaulter's current validation and reading contract.

## Consolidation

The active `/home/jim/vaulter` checkout on `feat/node-history` contains another session's
uncommitted preview and device-cache work. It is intentionally preserved for that session to
complete and merge. This integration was performed in `/tmp/vaulter-production-integration`.

55 old local branches are already ancestors of main. Their work remains in main's history.
The 14 superseded tips below are retained locally under `archive/2026-10-11/<branch>` tags before
branch removal. A complete local Git bundle was also verified before cleanup and retained at
`/home/jim/.local/share/vaulter/backups/branches-2026-10-11.bundle`; archive tags are not published. Restore any experiment
with `git switch -c <new-branch> archive/2026-10-11/<old-branch>`.

| Archived branch | Commit | Reason |
| --- | --- | --- |
| `actors` | `e7db1a0` | Superseded extension-framework experiment. |
| `backup/conversations-history-before-split` | `88453e8` | Unsplit design history; selected conversation iteration is on main. |
| `design/browser-backend` | `5521580` | Browser-authoritative storage prototype; superseded by GitHub node persistence. |
| `feat/agent-chat` | `f7bdd0d` | Earlier Agent integration; independent Agent and Chat are on main. |
| `node-data-model` | `7b24d8e` | Earlier history of the node model now implemented on main. |
| `pip` | `eebc4b8` | Earlier framework rebuild, including two local cleanup commits. |
| `pip-ui` | `91a814b` | Earlier UI/framework rebuild. |
| `pip-ui-next` | `ec7f47f` | Alternative UI/framework rebuild. |
| `pip-ui-old` | `dda0dac` | Earlier UI/framework rebuild. |
| `plan/vault-modules` | `39423b3` | Planning snapshot; current module contracts supersede it. |
| `spike/node-storage` | `33a77c4` | Storage demonstration; production node adapter implements the durable model. |
| `ticket/18-search` | `f68344f` | Earlier Command implementation; current base UI search supersedes it. |
| `typia-spike` | `ce24b03` | Type-validation experiment. |
| `ui-kit` | `2c30183` | UI kit for the earlier pip rebuild; current kit and selected designs remain on main. |

Clean obsolete worktrees and remote feature branches are removed after preserving history.
The active session checkout and the main integration checkout remain.

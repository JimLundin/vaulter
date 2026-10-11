# Production design integration and branch consolidation — 2026-10-11

Production now exposes node-backed Wiki pages and the selected Chat design. Wiki uses
underlined source links, evidence beside the page on desktop, and the shared drawer on phones.
Exact citations reconstruct source text and attribution at the source transaction snapshot;
migrated exchange links show their recorded source without inventing a claim citation.
Wiki searches page titles, summaries and aliases, renders migrated blocks and live page queries,
and links source exchanges to their saved Chat conversation.

The previous production artifact was `afc237d`. Main's selected Chat design was `e823049`,
but stale browser expectations failed CI and prevented deployment. Browser expectations now
match the selected design. Saved Chat history also opens when sending is unavailable, including
when no model key is configured. CI now checks the built production app on desktop and phone
before deployment.

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

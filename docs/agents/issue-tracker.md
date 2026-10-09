# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `JimLundin/vaulter`. Use the `gh` CLI and specify
`--repo JimLundin/vaulter` when the repository cannot be inferred from the current checkout.

## Operations

- Publish a spec or ticket: write its complete Markdown body to a temporary file, then run
  `gh issue create --repo JimLundin/vaulter --title "..." --body-file <file>`.
- Read an issue: `gh issue view <number> --repo JimLundin/vaulter --json number,title,body,labels,comments`.
- List issues: `gh issue list --repo JimLundin/vaulter --state open --json number,title,body,labels`;
  use `--label` and `--state` to narrow the result.
- Apply or remove a label: `gh issue edit <number> --repo JimLundin/vaulter --add-label "..."`
  or `--remove-label "..."`. Use the mapping in [triage-labels.md](triage-labels.md).
- Add an authorized comment: `gh issue comment <number> --repo JimLundin/vaulter --body-file <file>`.
- Close completed work: `gh issue close <number> --repo JimLundin/vaulter`.

When a skill says "publish to the issue tracker", create a GitHub issue. When it says
"fetch the relevant ticket", read the issue and its comments. Check for existing issues before
creating duplicates.

## Pull requests as a triage surface

**PRs as a request surface: no.** Issue and pull-request numbers share a namespace; resolve the
type before applying issue-specific operations. Change this flag to `yes` only if the project
adopts external pull requests as feature requests.

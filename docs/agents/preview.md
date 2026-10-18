# UI previews

The default preview renders the current `OpenApplication` with fictional records and a scripted Agent.
Keep that entry neutral: current product behavior, the existing movable preview pill, and no active
design comparison. `app/main.tsx` opens the same Application with production storage and credentials;
`app/preview/main.tsx` supplies sample adapters and the preview frame.

## Review a UI change

1. Work in the feature worktree. Use the scripts in `package.json` for the local design preview or
   kit gallery. Give simultaneous servers separate ports and open the server from that worktree.
2. Use the existing `DesignPreview` pill for Mobile, Component kit and Reset demo. Drag its grip
   to move it; arrow keys move the focused grip, and Home returns it to the top. On phones,
   expand Preview controls. Mobile constrains the same mounted app to 390px; switching it off
   follows the window and retains the route, drafts and open panes. Use phone browser checks for
   keyboard, focus or touch behavior that width simulation cannot establish.
3. Run focused checks under [testing.md](testing.md). Check a bundled build when fonts or geometry
   matter: a worktree sharing `node_modules` through a symlink can receive Vite font 403s. Fix the
   local serving setup or inspect `build:design`; keep production configuration tied to its needs.
4. After pushing, inspect `/preview/<branch-name>/version.json` and confirm its commit matches the
   reviewed branch. The hosted preview and its `kit/` gallery come from the Deploy workflow's
   retained design artifact. Root `version.json` identifies production separately.

## Compare alternatives

Keep experiments in an explicit comparison entry or prototype branch. Reuse public
`DesignComparison` and put its picker in the existing pill through
`DesignPreview.variantControls`:

```tsx
<DesignComparison
  alternatives={alternatives}
  defaultValue="balanced"
  preview={(controls, content) => (
    <DesignPreview {...previewProps} variantControls={controls}>
      {content}
    </DesignPreview>
  )}
/>
```

Keep fixtures equivalent across alternatives. The picker owns selection; changing devices retains
the active content, while changing variants mounts the chosen content afresh. See the
[kit preview interface](../../app/shared/ui/kit/README.md#live-comparisons) for the controls. Preserve the
comparison and verdict separately after selection, and return the default preview to current Application
behavior without variation labels or an inactive picker.

## Promote and verify

1. Implement the selected behavior in its owning production workflow and shared kit presentation.
   Application composes the same record UI wherever that record appears. Sample-only records and
   scripted model behavior belong in `app/preview/`; they supply examples, not the feature itself.
2. Run a focused production browser check through `app/main.tsx`, login and the production storage
   adapter with fictional transport fixtures. Verify the selected UI, explicit writes and reload;
   a preview pass alone cannot establish this path. Use the owning behavior checks for generation
   and persistence contracts.
3. Commit and push. Complete CI verification belongs to the exact commit's aggregate `test` job.
   Merge when authorized, then inspect the merged `main` commit's tests and `deploy` job.
4. Check the live site's root `version.json` against the deployed `main` commit. Confirm behavior
   through the production entry. Use isolated browser fixtures when a write would alter the user's
   Vault; retained sample previews remain separate artifacts.

`main` publishes production and restores retained branch previews. Other branches publish only
their sample preview while preserving the currently deployed production artifact. The hosted
preview uses a tab journal; Reset demo clears its accepted records,
while device preferences remain. Local `design:agent` uses configured server credentials with
sample storage; `build:design` always emits scripted behavior. New fictional fixtures must preserve
the existing recovery scenarios in `app/preview/eav.ts`.

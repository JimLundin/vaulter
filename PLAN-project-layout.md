# Project layout: user workflows with direct composition

Replace the extension architecture with workflow modules. A module owns a task from input to result:
its screens, behavior, state, and tests. The product assembles those modules directly with functions
and JSX.

The architectural seam moves from “what a feature contributes to a host” to “how a caller completes a
task.” A rename screen and an agent tool call the same rename operation. History is its own workflow,
rather than part of the agent because that is where its screen currently happens to live.

This replaces the earlier proposal. Source-folder removal and registration are the requirement;
runtime enable/disable behavior is outside this design.

## Three different designs considered

| Design | How features connect | Strength | Cost |
|---|---|---|---|
| Complete workspaces | Each feature is a complete app root over a shared vault; a launcher selects roots or shows two together | Strong isolation; one initializer per workspace | Separate searches and navigation; features cannot readily enrich each other's screens |
| User workflows with direct composition | Named functions and views; one product file wires their callers | Task behavior and tests stay together; dependencies remain visible | Several explicit bindings per feature in the composition file |
| Operation catalog with UI and agent adapters | A typed collection of queries/actions; callers invoke or adapt operations | One operation contract can serve several callers | Schemas and catalog machinery become another protocol to maintain |

**Choose direct composition.** This app has one shared vault and several ways to work with it.
Workflow modules preserve that experience without requiring every feature to fit a plugin contract.
Use schemas at the agent adapter, where inputs arrive from a model; ordinary TypeScript callers can
call ordinary functions.

Complete workspaces would be a stronger choice if separate experiences were desirable. An operation
catalog would become useful if many independent callers needed to enumerate and invoke operations.

## The layout

```text
app/
  main.tsx                       # boot and mount the product
  product.tsx                    # all optional workflow imports and wiring

  workflows/
    chat/
      index.tsx                  # useConversation, ChatPage, ChatPanel
      conversation.ts            # streaming, current conversation, background lifetime
      record.ts                  # capture orchestration from real conversation turns
      model.ts                   # model dependency
      tools.ts                   # chat's built-in file/read/check/commit tools
      rendering/
      *.test.ts

    rename-note/
      index.ts                   # named operation exports
      rewrite.ts                 # move note, rewrite links and note references
      RenameNotePage.tsx          # when the human review screen is added
      agent.ts                   # model input schema and adapter to rename operation
      *.test.ts

    history/
      index.tsx                  # HistoryPage and history-specific operations
      HistoryPage.tsx
      *.test.ts

    calendar/                    # example of a future workflow
      index.ts
      dates.ts                   # querying dates and changing a date
      CalendarPage.tsx
      agent.ts                   # only when model access to this task is needed
      *.test.ts

  vault/
    index.ts                     # live vault interface
    documents/                   # note parsing, vocabulary, references, graph
    validation/                  # permanent note and graph integrity
    changes/                     # current staging overlay, checked commits, conflicts
    session/                     # unlock, synchronization, encrypted offline state
    storage/
      github/
      memory.ts

  ui/
    Frame.tsx                    # presentation: receives children and explicit controls
    kit/                          # component kit and design from ui-kit
    routing.ts                   # generic route mechanics, no workflow imports

tools/
  check.ts                       # uses the same vault validation
  fs.ts
  seal-secrets.ts
```

The workflow folders are tasks, not contribution categories. `rename-note` owns rename behavior,
even when chat is its only current caller. `history` owns history presentation even when a link to it
appears beside chat. A future calendar owns date interpretation, queries, editing, and presentation.

The human rename screen and calendar above illustrate the design; they are not current functionality
to restore automatically. Small workflows need only a couple of files, not this entire scaffold.

## What actually changes

| Current design | Proposed design |
|---|---|
| Features export the same `Extension` descriptor | Each workflow exports the functions and views its callers need |
| Shell discovers pages, commands, panels, tools, and search by traversing features | `product.tsx` passes ordinary props and chooses views explicitly |
| Every view can retrieve a broad `Host` containing the installed features | Views receive a vault or narrower dependencies; optional callbacks arrive as props |
| Other features import routes and slots to modify a screen | Product composition connects named views and callbacks |
| Notes and graph contribute file selection and write checks as extensions | Vault data validity is independent of installed workflows |
| Tests combine shell mechanics with actual feature registrations | Workflow tests exercise the task; product tests exercise the chosen wiring |

Remove `Extension`, `Host`, feature contribution traversal, slot registration, and
`extensions/index.ts`. Do not recreate them as a `Workflow` manifest with renamed fields.
`Frame` does not load modules or discover behavior.

Keep useful implementations: the encrypted cache, GitHub/memory backend interface, conflict checks,
note parsers, graph derivation, route patterns, and shared visual primitives. Keeping those mechanisms
does not require keeping their current architecture.

## Concrete composition

This sketch uses existing hash-route mechanics; it does not assume a new router library.
The symbols from workflow folders are proposed named exports.

```tsx
// product.tsx — abbreviated; startup supplies the unlocked vault and model
import { useConversation, ChatPage, ChatPanel } from './workflows/chat/index.tsx';
import { renameTools } from './workflows/rename-note/agent.ts';
import { HistoryPage } from './workflows/history/index.tsx';
import { CalendarPage } from './workflows/calendar/CalendarPage.tsx';
import { calendarTools } from './workflows/calendar/agent.ts';

function Product({ vault, model }: ProductProps) {
  const route = useRoute();
  const conversation = useConversation({
    vault,
    model,
    tools: {
      ...renameTools(vault),
      ...calendarTools(vault),
    },
  });

  const page =
    route.path === '/agent/' ? <ChatPage conversation={conversation} /> :
    route.path === '/history/' ? <HistoryPage vault={vault} /> :
    route.path === '/calendar/' ? <CalendarPage vault={vault} /> :
    <NotFound />;

  return (
    <Frame
      navigation={[
        { label: 'Agent', href: '/agent/' },
        { label: 'History', href: '/history/' },
        { label: 'Calendar', href: '/calendar/' },
      ]}
      actions={<AskButton conversation={conversation} />}
      panel={<ChatPanel conversation={conversation} />}
    >
      {page}
    </Frame>
  );
}
```

Conversation lifetime sits above page selection. Moving to history or calendar does not stop a turn.
The controller holds a live vault dependency; an always-mounted indicator no longer updates a global
`chat.host`. Sign-out disposes the conversation and its subscriptions.

If calendar should offer “Ask about this event,” Product passes it a callback. Calendar neither imports
chat nor looks up an installed module. If a reader should display dates, its view accepts children and
Product composes the reader with a calendar view. Named views and normal props replace slot discovery.

Product owns global shortcuts, panel selection, and links to optional screens. A workflow owns its
internal controls and subroutes. Use the existing typed route patterns for parameterized paths.

## One task, two callers

Rename has one operation:

```ts
renameNote(vault, { from, to }): Promise<RenameResult>
```

Its implementation obtains current files, computes the complete move and reference rewrites, and
stages the result. The human view obtains input and presents a preview. The agent adapter validates
model input with Zod and calls that operation. Neither caller contains reference-rewriting logic.

The operation's interface includes missing-source and occupied-destination errors, allowed paths,
staging rather than committing, and conflict handling. Preview and execution must use a checked
revision so a change since preview cannot silently stage a different result.

Apply the same rule to other tasks. Calendar's date operation owns date interpretation and updates;
history owns history querying and revert presentation; chat owns streaming and capture orchestration.
There is no requirement that all workflows have the same methods.

## Data ownership and writes

Vault owns what makes persisted data valid: file representation, schema, references, and link
integrity. Workflows own what users can do with that data. Removing rename removes the capability,
not the ability to interpret note references. Removing calendar leaves existing date fields readable
and checked.

The vault module hides synchronization, encryption, cached snapshots, graph derivation, staged
previews, and checked writes. Ordinary workflow callers do not receive backend handles or raw secrets.
Model configuration is supplied specifically to chat.

Retain the current shared staging model during migration. Human forms keep unconfirmed input locally;
confirmed changes enter the shared overlay. Do not silently introduce separate persistent drafts as
part of a layout change.

The existing writer alone cannot isolate simultaneous producers of that overlay. Before adding another
writing workflow, establish exclusive write ownership across an agent's writing sequence: existing staged
changes must be explicitly included or resolved, and another workflow cannot stage or commit while
that sequence owns the writer. Release ownership on completion, failure, or cancellation. This is a
required coordination rule for multiple writers, separate from the initial folder and composition work.

Full-vault CI checks and “reject newly introduced problems” write checks retain their existing
semantics. GitHub fast-forward checks and per-file conflict identities stay behind the vault interface.

## Removal means one folder and one composition file

To remove calendar:

1. Delete `workflows/calendar/`, including its UI, operation, agent adapter, styles, and tests.
2. Remove its imports, route, navigation link, callbacks, and tool binding from `product.tsx`.
3. Run typecheck, tests, and build. Remove packages used only by calendar when applicable.

Chat, history, rename, and vault need no calendar-specific edits. An old calendar bookmark gets
Not found. Stored date fields remain.

“Registration” here is explicit code in one file, not one line of metadata. That is the price of
removing the host protocol. Locality means all feature wiring can be found in one place, and all
feature behavior can be deleted in one folder.

Workflows import the vault, shared presentation, and their own files. They never import another
optional workflow, even in tests. Product is the permitted composition exception. Enforce resolved
imports in CI, including aliases, dynamic imports, and re-exports. Cross-workflow tests belong with
Product and are removed with the corresponding wiring.

## Migration from this working tree

1. Create the live vault interface around existing session/backend/writer implementations. Move note,
   schema, reference, and graph mechanics behind it. Supply the mandatory rules directly; no extension
   list decides which files exist or which checks run.
2. Extract `rename-note` from notes/model and its tool wrapper. Move the agent's History screen into
   `history`; shared diff presentation follows its real callers. Convert chat to named views and a
   conversation controller using explicit dependencies.
3. Build `product.tsx` with the actual remaining chat/history screens and rename tool. Pass explicit
   content into Frame. Replace page, navigation, panel, command, and tool discovery together.
4. Delete the obsolete host/extension/slot machinery after its callers migrate. Keep generic routing,
   keys, search ranking, and UI primitives where they are still used.
5. Move task tests beside their task, and keep generic tests independent of product registrations.
   Remove assertions for currently deleted features. In a disposable copy, delete history and its
   Product wiring, then prove the remaining app typechecks, tests, and builds.

The current removal baseline already has unresolved reader imports in `core/slot.test.ts` and code
imports in `agent/tools.test.ts`. Fix their ownership as part of migration, without restoring deleted
features. Preserve rename, capture, Markdown safety, encryption, and backend conflict coverage.

Implemented: Product directly composes chat, rename-note and history over a permanent live vault. The ui-kit branch supplies the presentation. Resolved import checks and behavioral tests enforce the seams; History and rename removal were verified in disposable copies. The illustrative calendar and rename review screens above remain future work.

# Public presentation inventory

Audited after UI ownership migration. Every public kit value/type has its owner and actual source consumers below. Consumers are compiler-resolved through aliases and re-exports; declaration implementation files are omitted from their own consumer lists. Catalogue-only exports are retained shared presentation, with no invented production reuse. Private implementation ownership is exhaustively checked in `app/ui/kit/composition.ts`.

| Export | Owner / implementation | Actual production consumers | Kit internal / catalogue / preview / tests | Destination |
| --- | --- | --- | --- | --- |
| `Activity` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/workflows/chat/index.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Alert` (value) | Kit: `app/ui/kit/index.ts` | `app/application/index.tsx`<br>`app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `AlertDescription` (value) | Kit: `app/ui/kit/index.ts` | `app/application/index.tsx`<br>`app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `AlertTitle` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `AutoScrollArea` (value) | Kit: `app/ui/kit/primitives.tsx` | `app/workflows/chat/ChatSurface.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/supporting-pane.tsx` | Retained shared presentation |
| `Avatar` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Badge` (value) | Kit: `app/ui/kit/index.ts` | `app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Bars` (value) | Kit: `app/ui/kit/chart.tsx` | `app/workflows/wiki/rendering/blocks.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/pieces.test.tsx` | Retained shared presentation |
| `BarsProps` (type) | Kit: `app/ui/kit/chart.tsx` | — | — | Retained shared presentation |
| `Brand` (value) | Kit: `app/ui/kit/app.tsx` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/gallery.tsx`<br>`app/ui/kit/navigation.tsx` | Retained shared presentation |
| `Button` (value) | Kit: `app/ui/kit/index.ts` | `app/application/index.tsx`<br>`app/settings/ModuleSettings.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/chat/Chat.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/WikiPageView.tsx`<br>`app/workflows/wiki/index.tsx`<br>`app/workflows/wiki/rendering/blocks.tsx` | `app/preview/search.tsx`<br>`app/preview/wiki-example.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/render-composition.test.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Card` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardAction` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardContent` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardDescription` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardFooter` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardHeader` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CardTitle` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Checkbox` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Chip` (value) | Kit: `app/ui/kit/app.tsx` | `app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Choice` (type) | Kit: `app/ui/kit/app.tsx` | — | — | Retained shared presentation |
| `Choices` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/status-options.test.ts` | Retained shared presentation |
| `Cite` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CodeDiff` (value) | Kit: `app/ui/kit/diff.tsx` | `app/workflows/chat/Chat.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/pieces.test.tsx` | Retained shared presentation |
| `CodeDiffProps` (type) | Kit: `app/ui/kit/diff.tsx` | — | — | Retained shared presentation |
| `Columns` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `Command` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `CommandEmpty` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `CommandGroup` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CommandInput` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `CommandItem` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `CommandList` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `CommandOverlay` (value) | Kit: `app/ui/kit/command-overlay.tsx` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `CommandSeparator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `CommandShortcut` (value) | Kit: `app/ui/kit/index.ts` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Count` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DesignComparison` (value) | Kit: `app/ui/kit/design-comparison.tsx` | — | `app/preview/main.tsx`<br>`app/preview/record-examples.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/design-comparison.test.tsx` | Retained shared presentation |
| `DesignPreview` (value) | Kit: `app/ui/kit/preview.tsx` | — | `app/preview/main.tsx`<br>`app/preview/record-examples.tsx`<br>`app/preview/wiki.tsx`<br>`app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Details` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DialogFooter` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Dock` (value) | Kit: `app/ui/kit/primitives.tsx` | `app/workflows/chat/ChatSurface.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/supporting-pane.tsx` | Retained shared presentation |
| `Dot` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Drawer` (value) | Kit: `app/ui/kit/drawer.tsx` | `app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/app.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/settings.tsx`<br>`app/ui/kit/supporting-pane.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `DropdownMenu` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `DropdownMenuCheckboxItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `DropdownMenuGroup` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `DropdownMenuLabel` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuRadioGroup` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuRadioItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuSeparator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuShortcut` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuSub` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuSubContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuSubTrigger` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `DropdownMenuTrigger` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Empty` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `EmptyContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `EmptyDescription` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `EmptyHeader` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `EmptyMedia` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `EmptyTitle` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ExpandableRow` (value) | Kit: `app/ui/kit/expandable-row.tsx` | `app/vault/transactions/history/NodeHistory.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FeaturePage` (value) | Kit: `app/ui/kit/app.tsx` | `app/vault/transactions/history/HistoryPage.tsx`<br>`app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/wiki/index.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Field` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/field-options.test.ts` | Retained shared presentation |
| `FieldContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldDescription` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldError` (value) | Kit: `app/ui/kit/index.ts` | `app/settings/ModuleSettings.tsx`<br>`app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldGroup` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldLabel` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldLegend` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/field-options.test.ts` | Retained shared presentation |
| `FieldSeparator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldSet` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `FieldTitle` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Form` (value) | Kit: `app/ui/kit/app.tsx` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/text-box.tsx` | Retained shared presentation |
| `Gap` (type) | Kit: `app/ui/kit/parts/layout.tsx` | — | `app/ui/kit/app.tsx` | Retained shared presentation |
| `Gate` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/vault/Gate.tsx`<br>`app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Heading` (value) | Kit: `app/ui/kit/parts/layout.tsx` | `app/application/index.tsx`<br>`app/vault/Gate.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/preview/record-examples.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/settings.tsx` | Retained shared presentation |
| `HoverPreview` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/application/Previews.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/hover-preview.test.tsx` | Retained shared presentation |
| `Icon` (value) | Kit: `app/ui/kit/icons.tsx` | `app/search/Search.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/WikiPageView.tsx`<br>`app/workflows/wiki/rendering/references.tsx` | `app/ui/kit/app.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/conversation.tsx`<br>`app/ui/kit/design-cycle.tsx`<br>`app/ui/kit/drawer.tsx`<br>`app/ui/kit/expandable-row.tsx`<br>`app/ui/kit/navigation.tsx`<br>`app/ui/kit/overlay.tsx`<br>`app/ui/kit/preview.tsx`<br>`app/ui/kit/surfaces.tsx`<br>`app/ui/kit/theme.tsx` | Retained shared presentation |
| `IconName` (type) | Kit: `app/ui/kit/icons.tsx` | `app/navigation/commands.ts` | `app/ui/kit/app.tsx`<br>`app/ui/kit/expandable-row.tsx`<br>`app/ui/kit/navigation.tsx`<br>`app/ui/kit/theme.tsx` | Retained shared presentation |
| `iconNames` (value) | Kit: `app/ui/kit/icons.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `IconProps` (type) | Kit: `app/ui/kit/icons.tsx` | — | — | Retained shared presentation |
| `Input` (value) | Kit: `app/ui/kit/index.ts` | `app/settings/ModuleSettings.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/wiki/index.tsx` | `app/preview/search.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/gallery.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `InputGroup` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `InputGroupAddon` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/field-options.test.ts` | Retained shared presentation |
| `InputGroupButton` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `InputGroupInput` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `InputGroupText` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `InputGroupTextarea` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Item` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `ItemActions` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemDescription` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemFooter` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemGroup` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemHeader` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemMedia` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemSeparator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ItemTitle` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Json` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/agent/tool-presentation.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Kbd` (value) | Kit: `app/ui/kit/app.tsx` | `app/search/Search.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/navigation.tsx`<br>`app/ui/kit/tests/status-options.test.ts` | Retained shared presentation |
| `KeyHint` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/status-options.test.ts` | Retained shared presentation |
| `Label` (value) | Kit: `app/ui/kit/index.ts` | `app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `LatLon` (type) | Kit: `app/ui/kit/map.tsx` | — | — | Retained shared presentation |
| `Link` (value) | Kit: `app/ui/kit/index.ts` | `app/application/index.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/index.tsx`<br>`app/workflows/wiki/rendering/references.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `List` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ListDetail` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ListItem` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `LiveStatus` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/workflows/chat/ChatMessage.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `LoadingStatus` (value) | Kit: `app/ui/kit/surfaces.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Loader` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/vault/Gate.tsx`<br>`app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/wiki/index.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/loader.test.tsx` | Retained shared presentation |
| `MapPoint` (type) | Kit: `app/ui/kit/map.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/map-impl.tsx` | Retained shared presentation |
| `MapRoute` (type) | Kit: `app/ui/kit/map.tsx` | — | `app/ui/kit/map-impl.tsx` | Retained shared presentation |
| `MapView` (value) | Kit: `app/ui/kit/map.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `MapViewProps` (type) | Kit: `app/ui/kit/map.tsx` | — | `app/ui/kit/map-impl.tsx` | Retained shared presentation |
| `Mark` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Markdown` (value) | Kit: `app/ui/kit/conversation.tsx` | `app/workflows/chat/ChatMessage.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Message` (value) | Kit: `app/ui/kit/conversation.tsx` | `app/workflows/chat/ChatMessage.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `MobileActionButton` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `MobileBar` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `NavigationAction` (type) | Kit: `app/ui/kit/navigation.tsx` | — | — | Retained shared presentation |
| `NavigationDestination` (type) | Kit: `app/ui/kit/navigation.tsx` | — | — | Retained shared presentation |
| `NavigationSheet` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `NavigationSuite` (value) | Kit: `app/ui/kit/navigation.tsx` | `app/application/Frame.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Notice` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `OptionStrip` (value) | Kit: `app/ui/kit/primitives.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/conversation.tsx` | Retained shared presentation |
| `Overlay` (value) | Kit: `app/ui/kit/overlay.tsx` | `app/application/index.tsx`<br>`app/workflows/chat/Chat.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx` | `app/preview/search.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Page` (value) | Kit: `app/ui/kit/app.tsx` | `app/application/index.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `PageControls` (value) | Kit: `app/ui/kit/page-controls.tsx` | `app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/wiki/index.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/primitives.tsx` | Retained shared presentation |
| `PageControlsProps`, `PageSearchControl`, `PageFilterControl` (types) | Kit: `app/ui/kit/page-controls.tsx` | — | `app/ui/kit/navigation.tsx`<br>`app/ui/kit/mobile-edge-rail.tsx` | Retained shared presentation |
| `PageHeader` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Panel` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `PassageCard` (value) | Kit: `app/ui/kit/passage-card.tsx` | `app/workflows/wiki/rendering/references.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `PresentationPreview` (value) | Kit: `app/ui/kit/presentation.tsx` | — | `app/preview/record-examples.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/gallery.tsx`<br>`app/ui/kit/tests/hover-preview.test.tsx` | Retained shared presentation |
| `PreviewBar` (value) | Kit: `app/ui/kit/surfaces.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/preview.tsx` | Retained shared presentation |
| `PromptSuggestions` (value) | Kit: `app/ui/kit/conversation.tsx` | `app/workflows/chat/Chat.tsx`<br>`app/workflows/questions/QuestionItem.tsx` | `app/ui/kit/catalogue.tsx` | Shared suggestion list with complete wrapping labels and caller-owned selection and drafts |
| `Prose` (value) | Kit: `app/ui/kit/parts/layout.tsx` | `app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/conversation.tsx` | Retained shared presentation |
| `RadioGroup` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `RadioGroupIndicator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `RadioGroupItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `ReadingColumn` (value) | Kit: `app/ui/kit/primitives.tsx` | `app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Row` (value) | Kit: `app/ui/kit/index.ts` | `app/application/index.tsx`<br>`app/settings/ModuleSettings.tsx`<br>`app/search/Search.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/chat/Chat.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/WikiPageView.tsx`<br>`app/workflows/wiki/rendering/references.tsx` | `app/preview/record-examples.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `RowAction` (value) | Kit: `app/ui/kit/expandable-row.tsx` | `app/vault/transactions/history/NodeHistory.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ScrollArea` (value) | Kit: `app/ui/kit/index.ts` | `app/workflows/wiki/WikiPageView.tsx` | `app/preview/record-examples.tsx`<br>`app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SearchButton` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/navigation.tsx` | Retained shared presentation |
| `SelectionGroupHeading` (value) | Kit: `app/ui/kit/selection.tsx` | `app/workflows/chat/ConversationList.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Select` (value) | Kit: `app/ui/kit/index.ts` | `app/settings/ModuleSettings.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `SelectionList` (value) | Kit: `app/ui/kit/conversation.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SelectionRow` (value) | Kit: `app/ui/kit/selection.tsx` | `app/workflows/chat/ConversationList.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SendButton` (value) | Kit: `app/ui/kit/conversation.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Separator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `setTheme` (value) | Kit: `app/ui/kit/theme.tsx` | `app/application/index.tsx` | `app/ui/kit/tests/theme.test.tsx` | Retained shared presentation |
| `SettingField` (value) | Kit: `app/ui/kit/settings.tsx` | `app/application/AppearanceSettings.tsx`<br>`app/settings/ModuleSettings.tsx`<br>`app/vault/session/ui.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `SettingsMenu` (value) | Kit: `app/ui/kit/settings.tsx` | `app/application/index.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `SettingsSection` (value) | Kit: `app/ui/kit/settings.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Sidebar` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/navigation.tsx` | Retained shared presentation |
| `SidebarContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarFooter` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarGroup` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarGroupAction` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarGroupContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarGroupLabel` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarHeader` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarInset` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenu` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/navigation.tsx` | Retained shared presentation |
| `SidebarMenuAction` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuBadge` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuButton` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuSkeleton` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuSub` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuSubButton` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarMenuSubItem` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarProvider` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SidebarSeparator` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `SizeClass` (type) | Kit: `app/ui/kit/hooks/use-layout.ts` | — | `app/ui/kit/presentation.tsx` | Retained shared presentation |
| `SourceLabel` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Sources` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Spacer` (value) | Kit: `app/ui/kit/parts/layout.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Sparkline` (value) | Kit: `app/ui/kit/chart.tsx` | `app/workflows/wiki/rendering/blocks.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/pieces.test.tsx` | Retained shared presentation |
| `SparklineProps` (type) | Kit: `app/ui/kit/chart.tsx` | — | — | Retained shared presentation |
| `SplitView` (value) | Kit: `app/ui/kit/selection.tsx` | `app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Retained shared presentation |
| `Stack` (value) | Kit: `app/ui/kit/index.ts` | `app/agent/openai/Settings.tsx`<br>`app/agent/tool-presentation.tsx`<br>`app/application/index.tsx`<br>`app/settings/ModuleSettings.tsx`<br>`app/vault/content/tool-presentation.tsx`<br>`app/vault/session/ui.tsx`<br>`app/vault/storage/Settings.tsx`<br>`app/workflows/chat/Chat.tsx`<br>`app/workflows/chat/ChatMessage.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/chat/ConversationList.tsx`<br>`app/vault/transactions/history/HistoryPage.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx`<br>`app/workflows/questions/EmbeddedQuestion.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/questions/tool-presentation.tsx`<br>`app/workflows/wiki/WikiPageView.tsx`<br>`app/workflows/wiki/index.tsx` | `app/preview/record-examples.tsx`<br>`app/preview/search.tsx`<br>`app/preview/wiki-example.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `startTheme` (value) | Kit: `app/ui/kit/theme.tsx` | `app/main.tsx` | `app/preview/main.tsx`<br>`app/preview/record-examples.tsx`<br>`app/preview/wiki.tsx`<br>`app/ui/kit/main.tsx`<br>`app/ui/kit/tests/theme.test.tsx` | Retained shared presentation |
| `SupportingPane` (value) | Kit: `app/ui/kit/supporting-pane.tsx` | `app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/chat/ConversationList.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/supporting-pane-types.test.ts` | Retained shared presentation |
| `Surface` (value) | Kit: `app/ui/kit/primitives.tsx` | `app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/conversation.tsx`<br>`app/ui/kit/settings.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Tabs` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `TabsContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `TabsList` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `TabsTrigger` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `Text` (value) | Kit: `app/ui/kit/index.ts` | `app/agent/tool-presentation.tsx`<br>`app/application/index.tsx`<br>`app/search/Search.tsx`<br>`app/vault/content/tool-presentation.tsx`<br>`app/vault/session/ui.tsx`<br>`app/workflows/chat/Chat.tsx`<br>`app/workflows/chat/ChatMessage.tsx`<br>`app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/chat/ConversationList.tsx`<br>`app/workflows/chat/index.tsx`<br>`app/vault/transactions/history/HistoryPage.tsx`<br>`app/vault/transactions/history/NodeHistory.tsx`<br>`app/workflows/questions/EmbeddedQuestion.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/workflows/questions/QuestionsPage.tsx`<br>`app/workflows/questions/tool-presentation.tsx`<br>`app/workflows/wiki/WikiPageView.tsx`<br>`app/workflows/wiki/index.tsx`<br>`app/workflows/wiki/rendering/blocks.tsx`<br>`app/workflows/wiki/rendering/references.tsx` | `app/agent/tool-presentation.test.tsx`<br>`app/preview/main.tsx`<br>`app/preview/search.tsx`<br>`app/preview/wiki-example.tsx`<br>`app/ui/kit/catalogue.tsx`<br>`app/ui/kit/gallery.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx` | Retained shared presentation |
| `TextBox` (value) | Kit: `app/ui/kit/text-box.tsx` | `app/workflows/chat/Chat.tsx`<br>`app/workflows/questions/QuestionItem.tsx`<br>`app/settings/ModuleSettings.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx` | Shared controlled compact/longform text entry (#70) |
| `Textarea` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `TextProps` (type) | Kit: `app/ui/kit/parts/layout.tsx` | — | — | Retained shared presentation |
| `Theme` (type) | Kit: `app/ui/kit/theme.tsx` | — | — | Retained shared presentation |
| `ThemeSwitch` (value) | Kit: `app/ui/kit/theme.tsx` | `app/application/AppearanceSettings.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/gallery.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Timeline` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `TimelineItem` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `toast` (value) | Kit: `../../home/jim/vaulter/node_modules/sonner/dist/index.d.mts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Toaster` (value) | Kit: `app/ui/kit/index.ts` | `app/application/Frame.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ToggleGroup` (value) | Kit: `app/ui/kit/index.ts` | `app/workflows/questions/QuestionsPage.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `ToggleGroupItem` (value) | Kit: `app/ui/kit/index.ts` | `app/workflows/questions/QuestionsPage.tsx` | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/tests/browser.tsx`<br>`app/ui/kit/tests/controls.tsx`<br>`app/ui/kit/tests/setting-fields.test.tsx` | Retained shared presentation |
| `Tone` (type) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/map.tsx` | Retained shared presentation |
| `Toolbar` (value) | Kit: `app/ui/kit/primitives.tsx` | `app/workflows/chat/ChatSurface.tsx`<br>`app/workflows/wiki/WikiPageView.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ToolGroup` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/workflows/chat/ChatMessage.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `ToolResult` (value) | Kit: `app/ui/kit/surfaces.tsx` | `app/agent/tool-presentation.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Tooltip` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `TooltipContent` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `TooltipProvider` (value) | Kit: `app/ui/kit/index.ts` | `app/application/Frame.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `TooltipTrigger` (value) | Kit: `app/ui/kit/index.ts` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `UnifiedDiff` (value) | Kit: `app/ui/kit/surfaces.tsx` | — | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `Unstyled` (type) | Kit: `app/ui/kit/lib/unstyled.tsx` | — | `app/ui/kit/app.tsx`<br>`app/ui/kit/parts/layout.tsx`<br>`app/ui/kit/primitives.tsx` | Retained shared presentation |
| `useLayout` (value) | Kit: `app/ui/kit/hooks/use-layout.ts` | `app/application/index.tsx` | `app/ui/kit/app.tsx`<br>`app/ui/kit/command-overlay.tsx`<br>`app/ui/kit/conversation.tsx`<br>`app/ui/kit/drawer.tsx`<br>`app/ui/kit/navigation.tsx`<br>`app/ui/kit/overlay.tsx`<br>`app/ui/kit/presentation-policy.tsx`<br>`app/ui/kit/preview.tsx`<br>`app/ui/kit/primitives.tsx`<br>`app/ui/kit/supporting-pane.tsx`<br>`app/ui/kit/surfaces.tsx`<br>`app/ui/kit/theme.tsx` | Retained shared presentation |
| `useTheme` (value) | Kit: `app/ui/kit/theme.tsx` | — | `app/ui/kit/parts/sonner.tsx` | Retained shared presentation |
| `VoiceButton` (value) | Kit: `app/ui/kit/conversation.tsx` | `app/application/index.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `VoiceStatus` (value) | Kit: `app/ui/kit/conversation.tsx` | `app/workflows/chat/Chat.tsx` | `app/ui/kit/catalogue.tsx` | Retained shared presentation |
| `WorkspaceFrame` (value) | Kit: `app/ui/kit/app.tsx` | — | `app/ui/kit/catalogue.tsx`<br>`app/ui/kit/navigation.tsx` | Retained shared presentation |

## Text-entry consumers (#70)

The public [TextBox interface](../app/ui/kit/README.md#textbox-interface) owns shared field/action
assembly and input protection. The migration scope follows the input's task, with one composition
for controlled free-text drafting and editing.

| Consumer | Shared entry | Owner responsibility |
|---|---|---|
| Chat page and supporting pane | Compact TextBox | Draft lifetime, submission/review, voice capture and Stop |
| Questions collection, details and embedded Wiki answers | Compact TextBox with voice and shared Enter/Save submission | Suggestions, per-choice drafts, dictation association, stale wording, acceptance and save/retry |
| ModuleSettings: Chat Instructions and Agent Stop sequences | Longform TextBox without submission | Immediate edits, parsing, device preferences, invalid drafts and reset |
| Text box, Feed & composer and Agent panel catalogue examples | The same public TextBox | Independent sample drafts and scripted acceptance |
| Page/global search, credentials, passwords, numeric settings and single-value identifiers | Existing specialized controls | Search/navigation, secure/native input semantics and typed settings |

Input primitives register the complete TextBox surface in shared presentation policy. Floating app
navigation protects that surface before focus, after blur, during capture/saving and across viewport
changes. Callers do not calculate rail offsets. Primitive catalogue/policy fixtures remain low-level
examples rather than alternative module entry interfaces. `Composer` is replaced by `TextBox` without
an additional public alias.

## Retired ownership paths

| Removed export/path | Final owner / replacement |
| --- | --- |
| ConversationPage, ConversationSurface, ConversationWelcome, ConversationFeed, ConversationPanel | Chat record views and ChatSurface; shared ReadingColumn/AutoScrollArea/Dock/SupportingPane |
| WikiPageSurface and Wiki shell | WikiPageView; shared Toolbar/ReadingColumn/SupportingPane |
| HistorySurface, HistoryEntry | History TransactionItem; shared ExpandableRow/RowAction |
| SearchSurface | SearchView; shared CommandOverlay |
| AdaptivePanel, SupportingColumn, ResponsiveSupportingColumn; Drawer reading/supporting placements | One SupportingPane policy; no compatibility aliases |
| ReferenceCard custom clipping/scroll/disclosure | Wiki reference interpretation; kit PassageCard mechanics |
| ProvenancePrototype and prototype-provenance.tsx | Fictional app/preview records through real NodeStore/readWiki/module record views |
| Preview variant hook in production ConversationList | Explicit caller selection variant; no preview context dependency |
| app/ui/Unlock.tsx | Vault Session-owned Unlock in app/vault/session/ui.tsx |
| SecretSettings in app/settings/ModuleSettings.tsx; Application credential maps and nullable task wiring | Vault Session credential projection/actions and CredentialSetting; provider-owned Settings views |
| Application embedded Question loading/answer composition; Chat-owned Content and Questions tool receipt interpretation | Questions-owned embedded record/Answer implementation; Content/Questions receipt adapters through Agent-owned recorded Tool execution UI |

## Mechanics and composition ownership

The declaration inventory in `app/ui/kit/composition.ts` is the checked authority for private
implementation roles. Native pages, navigation's responsive/anchor assembly, Base UI adapters,
formatted data display, map probes, passage disclosure and bounded positioning own DOM/library
mechanics. Their exact declarations are enumerated; placing a new file beside them or exporting a
new component does not grant that role. Shared control compositions, SupportingPane, Settings,
ThemeSwitch, Overlay, ItemGroup/SidebarMenu wrappers, HoverPreview's resolver adapter and
PresentationSurface's state provider remain checked. New unchecked native declarations in mixed
files fail CI. Catalogue and browser adapters are exact enumerated sources, separate from the
production dependency boundary.

Application's route-anchor restoration and the existing keyboard task-row adapter retain their
specific browser responsibilities. Module record/rendering helpers cannot own measured layout,
scrolling or viewport choices. The exact vault-link transform may annotate semantic data; it
cannot produce native UI or import presentation libraries. Wiki block markup and Chat code/error
content retain exact narrow semantic permissions.

Provider settings views bind their own definitions and preference lifetime, and compose the
Session-owned credential setting through its safe credential interface. Agent and Jina settings
views therefore have no direct kit imports; OpenAI and GitHub settings directly use only Stack.
The shared ModuleSettings renderer retains ordinary preference drafts, choices and reset behavior.

Exports whose implementation is `index.ts` are styling-free public adapters over their named
`parts/` control; the explicit private declaration inventory records those underlying owners.
An export with no direct production caller may still compose a production component internally;
the internal consumer column records that relationship separately from actual direct application
use. DesignPreview, DesignComparison and PresentationPreview are neutral bounded presentation
adapters: their current callers are previews/catalogue, and they contain no fictional record schema.

Compact navigation now uses the private `mobile-edge-rail.tsx` composition. `PageControls` owns the
shared inline/rail placement contract; modules retain search, filter and action semantics. Input
primitives register protected surfaces through `presentation-policy.tsx`, and the rail owns their
clearance. The comparison is preserved through the archive linked in
[the selected design delivery](design/mobile-edge-rail.md).

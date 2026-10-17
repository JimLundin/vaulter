# Calendar layout comparison

Question: where should desktop month navigation and event actions live when the timeline uses
the same right supporting pane as other modules?

Constraint: the entire month grid must fit in the available page height. All variants reserve
space for the shared header and compact month controls, then give the remaining height to equal
week rows. The timeline scrolls independently. This applies to five- and six-week months.

Run `npm run design -- --port 4191`, then open
`/preview/index.html?compare=calendar&variant=toolbar#/calendar/`.
Use the existing preview pill to cycle designs and toggle Mobile. The variant is retained in
the URL. Device changes preserve local drafts and selections; changing variants resets them.

- `toolbar`: month and arrows on the left, compact Add/Manage actions on the right.
- `pane`: month navigation above the grid, event actions above the right timeline.
- `minimal`: month navigation with an overflow menu for Add/Manage.

All variants retain the Application sidebar, shared module header, identical fictional records,
and shared SupportingPane. On mobile the edge rail exposes actions and opens the timeline as
a drawer; selecting a day focuses that drawer. Prototype additions/removals exist only in local
component state and do not call the Calendar write API.

Mobile navigation uses a bottom edge rail with Previous month, the current month and Next month.
Its reserved height keeps the entire calendar visible above it. Add, Manage and Timeline remain
on the side rail; Manage uses a pencil icon so it differs from the Timeline list icon.

This is a throwaway comparison. No design has been selected. The default preview still renders
the current production Calendar. Once selected, promote the layout through Calendar and shared
kit presentation and retain this comparison and verdict on a prototype branch.

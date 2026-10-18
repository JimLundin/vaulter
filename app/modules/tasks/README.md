# Tasks

Tasks owns retained tasks, admission, snapshot reading, reusable cards and the Tasks board route.
The fixed board uses Backlog, Ready, In progress and Done. Cancelled and abandoned tasks remain
accessible below the board; removing a task marks it unavailable without erasing its history.
A due date is an optional civil `YYYY-MM-DD` value and does not advance status automatically.

`createTask`, `reviseTask` and `removeTask` append explicit transactions. `readTasks` accepts an
optional snapshot and joins provenance within that snapshot. Imported original status belongs in
`sourceStatus`, with historical source references in `sources`. Producers choose native status
explicitly; no migration runs while opening the application. Changing status never invents a
completion timestamp.

`TaskCard` accepts an owner projection independently of the page and optional action content.
Application supplies the shared database, trusted author and admission. The UI retries the exact
finalized `SaveError` publication rather than recalculating a failed submission.

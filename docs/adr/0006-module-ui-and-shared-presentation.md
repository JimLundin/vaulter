# Keep record UI with its module and share presentation in the kit

Modules own the UI that interprets their records and performs their tasks. The UI kit owns base
presentation and shared compositions used by those modules. Repeated presentation patterns belong
in the kit so a design change has one implementation to change. We accept some loss of tailored
UI/UX in exchange for consistency, a smaller presentation interface, and less coupling between
modules. A kit made only of tiny controls would still force each module to rebuild the same layouts.

The rendering pipeline is NodeStore → module-owned typed projection → module-owned record UI →
kit presentation. Record UI accepts stored payload types or projections that retain their meaning,
with resolved relationships, version/snapshot context, availability and explicit actions as needed.
Queries, subscriptions, execution and persistence belong to the owning module's reading or lifetime
implementation. The kit accepts presentation values and content; it does not interpret conversation,
citation or transaction records or import their owning modules.

Supporting panes use one kit-owned presentation policy for width, header, scrolling, dismissal,
focus and responsive transitions. Modules choose their content and task actions; they do not choose
their own geometry or interaction mechanics. This decision does not require a single occupied pane
or change which panes can be open together. Consolidating that application behavior is outside this
migration's scope.

Shared presentation is extracted based on real reuse. Domain interpretation stays with its owner;
another module does not acquire that interpretation by copying it or moving it into the kit. Product
continues to compose workflow interfaces explicitly. Existing Base UI mechanics, the generic node
model and historical citation semantics remain as decided in ADR 0001, 0002 and 0005.

This decision is implemented. The deliveries and enforcement checks are recorded in
[the UI module ownership plan](../plans/ui-module-ownership.md), with current public consumers and
retired ownership paths in the [presentation inventory](../ui-presentation-inventory.md).

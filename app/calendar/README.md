# Calendar

Calendar owns the shared `TimeValue` convention, particular Events and recurring annual dates.
Its public interface is `index.ts`; Application registers `calendarEntities` in the shared EAV
database. Other owners can use the time contract for source/reporting or effective time without
creating an Event. `CalendarPage` provides a month grid and supporting timeline with explicit event creation,
revision and removal. Calendar is available at `/calendar/` in Application navigation.

`TimeValue` distinguishes points, inclusive ranges and unknown time. Points retain year, month,
day or offset-qualified instant precision. Known points/ranges carry an explicit `approximate`
flag and optional original `expression`. Unknown time can retain wording without normalization.
Instant timezone is optional provenance; timeline callers explicitly choose their viewing timezone.
Civil dates never become asserted midnight instants. Calendar uses the Gregorian calendar,
years 1–9999. Ranges require comparable endpoints; mixing instants and civil dates requires an
explicit normalization decision by the caller.

`createEvent` atomically admits its description, explicit status, occurrence/scheduling time,
optional reporting time, participant/place associations and source references. Associations
retain role and order independently. Subjects and sources use engine-validated exact snapshot
references to the original owner identity; Calendar does not create duplicate Subject records.
Those references retain the recorded identity/description after the original record is removed.
Attaching a source does not declare evidence reviewed. Structured assertion review is subsequent
work; Calendar does not manufacture evidence support or automatically accept extracted claims.

`reviseEvent` explicitly changes a plan or status. EAV history retains the earlier plan; the
passage of time never changes `planned` to `occurred`. `removeEvent` hides the live event while
its historical state and associations remain readable. Writes accept EAV transaction attribution.
Storage publication conflicts/errors propagate to the caller; Calendar never reruns acceptance.

`readCalendar` pins one accepted snapshot across the records it joins. Supply a transaction to
read history. `readTimeline` accepts an inclusive `YYYY-MM-DD` window and IANA timezone. It
returns dated events with civil coverage, recurring dates separately, and unknown-time events
in `undated`. Month/year coverage and approximation remain on the original TimeValue; coverage
is navigation information, not a claim that the event occupied the whole period. Annual dates
expand only within the requested window, without storing occurrences or inventing a birth year.
February 29 appears only in leap years; no implicit February 28/March 1 substitution is made.
`reviseAnnualDate` corrects a recurring date or hides/restores it through `available`, retaining
its earlier values in history.

The implementation adopts the time/events portion of
[the knowledge model proposal](../../docs/research/knowledge-model-proposal.md).
Legacy date reconstruction, reminders, arbitrary recurrence rules and Decision/Task lifecycle
are not implemented by this module.

`CalendarTimeline` is an embeddable record view. Supply `CalendarEntry` values from
`calendarEntries(data, year, timezone)`; it owns neither global navigation nor a scroll container.
Application resolves subject identities and supplies a filtered timeline to Wiki's `renderTimeline`
slot. Wiki does not import Calendar. Month cells receive exact dates and annual recurrences;
approximate dates and ranges appear separately rather than as invented appointments.
The kit's generic `Timeline` and `MonthCalendar` own shared layout and controls.

The editor creates events with an exact day or unknown date and can revise description/status
while preserving any existing rich time value. New month/year/instant/range values, participant
roles, source links and annual dates remain available through the data API.
Failed saves retain the draft and error for explicit retry; successful acceptance refreshes the
subscribed view. Calendar actions bind the configured user Actor and attribute each write.

The regular Application preview opens Calendar at `/preview/index.html#/calendar/`, with its
sidebar and mobile edge rail. `PageControls` supplies month navigation in a horizontal bottom rail on mobile, with event
creation, management and timeline access on the side rail. The full month grid fits the remaining
page height; the right timeline scrolls independently and becomes a drawer on mobile. Desktop
keeps Add/Manage above the timeline. Event management opens a shared overlay for edit and removal.
The retained `/preview/calendar.html` link redirects into this full preview; adding `?embedded`
opens the Garden studio Wiki page with its subject timeline. Both use fictional Calendar records.

The reviewed alternatives are retained on `prototype/calendar-layouts` at `16b417b`. The chosen
layout is B (Timeline actions), with the bottom month rail and a calendar that fits the viewport.

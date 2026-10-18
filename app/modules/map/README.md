# Map

Map owns geographic coordinate values and Coordinate records associated with existing Vault
records. Its public interface is `index.ts`; Application registers `mapEntities` in the shared
EAV journal.

`CoordinateValue` uses WGS84 latitude/longitude (`EPSG:4326`). It accepts decimal degrees or
structured degrees/minutes/seconds with a hemisphere and retains optional source `expression`.
`parseCoordinates` rejects invalid angular values, missing axes and other coordinate systems.
Arbitrary projected grids, geocentric coordinates and coordinate conversions are outside Map.

`MapPage` is available at `/map/` in Application navigation. It shows the retained OpenFreeMap Positron/light and Dark base maps,
keyboard-selectable markers and a supporting list that becomes a drawer on phones. Zoom controls
sit at the bottom-right; attribution starts collapsed at the bottom-left and remains expandable.
The coordinate pane uses compact task actions, grouped selected-record details and dense list rows. Add coordinates
chooses an existing Wiki, Calendar, Question or Source document record and decimal latitude/longitude.
Edit preserves a stored DMS representation when its numeric position is unchanged. Failed saves
retain the draft for explicit retry; removing a location retains its history. Offline reading
retains coordinates even when map tiles cannot load. MapLibre loads OpenFreeMap vector tiles and displays contributor attribution. Appearance follows
the application theme, including system changes, and switching theme retains camera and selection. No geocoding or device location is requested.

The kit's `MapView` owns pan/zoom, marker mechanics, resizing and base-map presentation. Map owns
coordinate interpretation and record UI; Application supplies foreign-record choices and user
attribution. The ordinary preview includes fictional coordinates on its existing sample pages.

`createCoordinates(db, { subject, coordinates }, context?)` admits one position with a mandatory
engine-validated historical reference to an existing accepted record of any owner type. Several
positions can describe one subject. Map creates no duplicate Place or Subject. References pin
the associated record's accepted state and survive later edits/deletion; they are not live
foreign keys. A subject must already have an accepted snapshot before coordinates can attach.

`reviseCoordinates(db, coordinate, value, context?)` replaces the value on the same identity and
preserves its subject. `removeCoordinates` hides the live record; previous values remain in EAV
history. All writes accept transaction author/origin context and propagate publication failures
without rerunning acceptance.

`readCoordinates(db, { subject?, snapshot? })` returns active records at one pinned accepted
snapshot. Subject filtering matches the original owner identity across historical reference
cutoffs, so changing the subject's title does not detach its coordinates. An omitted subject
returns all coordinates; an omitted snapshot reads current accepted state. Returned projections
retain EAV identity and can be passed to revision/removal. Reads perform no external effects.

```ts
const record = await createCoordinates(db, {
  subject: await db.history.reference(snapshot, existingRecord),
  coordinates: {
    kind: 'geographic',
    crs: 'EPSG:4326',
    latitude: 59.3293,
    longitude: 18.0686,
  },
}, { author });
const positions = await readCoordinates(db, { subject: recordSubject });
```

Focused behavior verification: `npm run test:fast -- app/map app/application/map.test.ts`.

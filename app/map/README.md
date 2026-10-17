# Map

Map owns geographic coordinate values and Coordinate records associated with existing Vault
records. Its public interface is `index.ts`; Application registers `mapEntities` in the shared
EAV journal. Map has no UI, tile provider, geocoder or coordinate conversion dependency.

`CoordinateValue` retains an explicit CRS identifier (for example `EPSG:4326`, `EPSG:3006` or
`EPSG:4978`). Geographic values use named latitude/longitude axes in decimal degrees or structured
degrees/minutes/seconds with a hemisphere. Projected values use easting/northing and an explicit
unit; geocentric values use x/y/z and an explicit unit. Geographic/projected values may carry a
height with its own unit and vertical CRS. Optional `expression` retains original source wording.
UTM zone/hemisphere and local grid definitions belong in an unambiguous CRS identifier.

`parseCoordinates` rejects missing systems, non-finite values, invalid angular ranges/hemispheres,
and extra fields. CRS and unit identifiers are required nonempty strings: the module does not
consult a CRS catalogue, certify unit/system compatibility, convert values, or decode arbitrary
text/grid-reference formats. Such inputs must first be explicitly interpreted into these forms.
The supplied representation is retained without implicit normalization or inferred precision.

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

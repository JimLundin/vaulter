import { z } from 'zod';

const identifier = z.string().trim().min(1);
const finite = z.number().finite();
const dms = z
  .object({
    degrees: finite.int().nonnegative(),
    minutes: finite.int().min(0).max(59),
    seconds: finite.min(0).lt(60),
    hemisphere: z.enum(['N', 'S', 'E', 'W']),
  })
  .strict();

function angle(axis: 'latitude' | 'longitude', limit: number) {
  return z.union([
    finite.min(-limit).max(limit),
    dms.refine(
      (value) =>
        (axis === 'latitude'
          ? value.hemisphere === 'N' || value.hemisphere === 'S'
          : value.hemisphere === 'E' || value.hemisphere === 'W') &&
        value.degrees + value.minutes / 60 + value.seconds / 3600 <= limit,
      `Invalid ${axis} angle`,
    ),
  ]);
}

const height = z.object({ value: finite, unit: identifier, crs: identifier }).strict();
const provenance = { expression: z.string().optional() };

const coordinates = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('geographic'),
      crs: identifier,
      latitude: angle('latitude', 90),
      longitude: angle('longitude', 180),
      height: height.optional(),
      ...provenance,
    })
    .strict(),
  z
    .object({
      kind: z.literal('projected'),
      crs: identifier,
      easting: finite,
      northing: finite,
      unit: identifier,
      height: height.optional(),
      ...provenance,
    })
    .strict(),
  z
    .object({
      kind: z.literal('geocentric'),
      crs: identifier,
      x: finite,
      y: finite,
      z: finite,
      unit: identifier,
      ...provenance,
    })
    .strict(),
]);

/** Explicit geographic axes; decimal angles use degrees. No CRS conversion is implied. */
export type CoordinateValue = z.infer<typeof coordinates>;
export function parseCoordinates(value: unknown): CoordinateValue {
  return coordinates.parse(value);
}

import { z } from 'zod';

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

const coordinates = z
  .object({
    kind: z.literal('geographic'),
    crs: z.literal('EPSG:4326'),
    latitude: angle('latitude', 90),
    longitude: angle('longitude', 180),
    expression: z.string().optional(),
  })
  .strict();

/** WGS84 latitude/longitude, in decimal degrees or degrees/minutes/seconds. */
export type CoordinateValue = z.infer<typeof coordinates>;
export function parseCoordinates(value: unknown): CoordinateValue {
  return coordinates.parse(value);
}

export function decimalDegrees(value: CoordinateValue['latitude']): number {
  if (typeof value === 'number') return value;
  const magnitude = value.degrees + value.minutes / 60 + value.seconds / 3600;
  return value.hemisphere === 'S' || value.hemisphere === 'W' ? -magnitude : magnitude;
}

import { z } from 'zod';

const jsonObject = z.record(z.string(), z.json());
const recorded = <T extends z.ZodType>(value: T) => value.nullable().optional();
const text = recorded(z.string());
const number = recorded(z.number().finite());
const timestamp = z.union([
  z.iso.datetime({ offset: true }),
  z.iso.datetime({ offset: true, precision: -1 }),
]);
const timing = z
  .object({
    requested: recorded(timestamp),
    observed: recorded(timestamp),
    received: recorded(timestamp),
    elapsedMs: recorded(z.number().finite().nonnegative()),
  })
  .strict();
const source = z
  .object({
    kind: z.string().min(1),
    name: text,
  })
  .catchall(z.json());
const host = z
  .object({
    host: text,
    os: text,
    kernel: text,
    arch: text,
    user: text,
    shell: text,
    node: text,
    timezone: text,
  })
  .catchall(z.json());
const session = z
  .object({
    session: text,
    entrypoint: text,
    effort: text,
    turns: recorded(z.number().int().nonnegative()),
  })
  .catchall(z.json());
const weather = z
  .object({
    latitude: recorded(z.number().min(-90).max(90)),
    longitude: recorded(z.number().min(-180).max(180)),
    intervalSeconds: recorded(z.number().finite().nonnegative()),
    temperatureC: number,
    apparentTemperatureC: number,
    humidityPercent: recorded(z.number().min(0).max(100)),
    precipitationMm: recorded(z.number().finite().nonnegative()),
    cloudPercent: recorded(z.number().min(0).max(100)),
    windMps: recorded(z.number().finite().nonnegative()),
    daylight: recorded(z.boolean()),
    raw: recorded(z.json()),
  })
  .catchall(z.json());
function outcome<T extends z.ZodType>(value: T) {
  return z
    .object({
      status: z.enum(['collected', 'failed', 'unknown', 'missing']),
      value: recorded(value),
      quality: recorded(jsonObject),
      reason: text,
    })
    .strict();
}
const common = { source, time: timing };
const observation = z.discriminatedUnion('subject', [
  z.object({ subject: z.literal('host'), ...common, outcome: outcome(host) }).strict(),
  z.object({ subject: z.literal('session'), ...common, outcome: outcome(session) }).strict(),
  z.object({ subject: z.literal('weather'), ...common, outcome: outcome(weather) }).strict(),
]);

/** Optional fields mean unrecorded; null means an explicitly recorded missing value.
 * Timestamp expressions are retained byte-for-byte, including offset and clock precision.
 */
export type ObservationValue = z.infer<typeof observation>;
export function parseObservation(value: unknown): ObservationValue {
  return observation.parse(value);
}

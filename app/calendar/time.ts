import { z } from 'zod';

const year = z.number().int().min(1).max(9999);
const month = z.number().int().min(1).max(12);
const day = z.number().int().min(1).max(31);
const zone = z.string().refine((value) => {
  try {
    Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions();
    return true;
  } catch {
    return false;
  }
}, 'Invalid timezone');

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y + 400, m, 0)).getUTCDate();
}

const point = z.discriminatedUnion('precision', [
  z.object({ precision: z.literal('year'), year }).strict(),
  z.object({ precision: z.literal('month'), year, month }).strict(),
  z
    .object({ precision: z.literal('day'), year, month, day })
    .strict()
    .refine((value) => value.day <= daysInMonth(value.year, value.month), 'Invalid calendar day'),
  z
    .object({
      precision: z.literal('instant'),
      value: z.iso.datetime({ offset: true }),
      timezone: zone.optional(),
    })
    .strict(),
]);

export type TimePoint = z.infer<typeof point>;

function ordinal(value: TimePoint): string {
  if (value.precision === 'instant') return new Date(value.value).toISOString();
  return `${String(value.year).padStart(4, '0')}-${String('month' in value ? value.month : 1).padStart(2, '0')}-${String('day' in value ? value.day : 1).padStart(2, '0')}`;
}

const time = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('point'),
      point,
      approximate: z.boolean(),
      expression: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('range'),
      start: point,
      end: point,
      approximate: z.boolean(),
      expression: z.string().optional(),
    })
    .strict()
    .refine(
      (value) =>
        (value.start.precision === 'instant') === (value.end.precision === 'instant') &&
        ordinal(value.start) <= ordinal(value.end),
      'Range must use comparable, ordered endpoints',
    ),
  z.object({ kind: z.literal('unknown'), expression: z.string().optional() }).strict(),
]);

/** Source wording is retained; normalization is always an explicit caller decision. */
export type TimeValue = z.infer<typeof time>;
export function parseTime(value: unknown): TimeValue {
  return time.parse(value);
}
export function parseTimezone(value: unknown): string {
  return zone.parse(value);
}

export function parseDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Expected YYYY-MM-DD');
  point.parse({
    precision: 'day',
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8)),
  });
  return value;
}

/** Civil bounds are query coverage, never an asserted event instant. */
export function timeDays(
  value: TimeValue,
  timezone: string,
): { start: string; end: string } | undefined {
  if (value.kind === 'unknown') return undefined;
  const bounds = (p: TimePoint) => {
    if (p.precision === 'instant') {
      const parts = new Intl.DateTimeFormat('en', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date(p.value));
      const part = (type: string) => parts.find((item) => item.type === type)!.value;
      const date = `${part('year').padStart(4, '0')}-${part('month')}-${part('day')}`;
      return { start: date, end: date };
    }
    const start = ordinal(p);
    const m = p.precision === 'year' ? 12 : p.month;
    const d = p.precision === 'day' ? p.day : daysInMonth(p.year, m);
    return {
      start,
      end: `${String(p.year).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    };
  };
  return value.kind === 'point'
    ? bounds(value.point)
    : { start: bounds(value.start).start, end: bounds(value.end).end };
}

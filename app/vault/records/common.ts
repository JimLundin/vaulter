// Shared value shapes for retained records whose modules are not implemented yet.
import { z } from 'zod';

export const text = z.string().min(1);
export const instant = z.iso.datetime({ offset: true });
/** A calendar date as precise as known: a day, a month or a year. */
export const localDate = z
  .string()
  .regex(/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/, 'Expected YYYY-MM-DD, YYYY-MM or YYYY');
/** How exactly a time is known; components format the time to this precision. */
export const precision = z.enum(['second', 'minute', 'day', 'approximate']);
export type Precision = z.infer<typeof precision>;

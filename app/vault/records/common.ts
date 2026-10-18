// Shared validation values used by current Wiki, Questions and historical Chat records.
import { z } from 'zod';

export const text = z.string().min(1);
/** How exactly a time is known; components format the time to this precision. */
export const precision = z.enum(['second', 'minute', 'day', 'approximate']);
export type Precision = z.infer<typeof precision>;

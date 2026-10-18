// Occurrence precision for retained Conversation contributions.
import { z } from 'zod';

/** How exactly a time is known; components format the time to this precision. */
export const precision = z.enum(['second', 'minute', 'day', 'approximate']);
export type Precision = z.infer<typeof precision>;

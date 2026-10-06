// The wiki: pages about people, places, events and topics, every fact citing
// the notes it came from. Its API is operations, which it offers the core.

import type { Extension } from '#core';
import { wiki } from './operations.ts';

export * from './api.ts';
export { wiki } from './operations.ts';

export const extension = { operations: wiki } satisfies Extension;

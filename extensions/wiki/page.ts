// A wiki page's fields: what the wiki registers as its `page` record type.
import { z } from 'zod';

export const KINDS = ['person', 'place', 'event', 'topic'] as const;

export const pageFields = {
  title: z.string().trim().min(1),
  kind: z.enum(KINDS),
  body: z.string(),
  /** The notes this page's facts come from. */
  sources: z.array(z.string()),
};
export type PageFields = typeof pageFields;

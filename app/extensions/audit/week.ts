// This week's audit: what the page shows and the agent's tool returns.
import { audit, daysBefore, type History } from './audit.ts';
import { today } from '../../core/format.ts';
import type { Note } from '../notes/model/fields.ts';
import type { Schema } from '../notes/model/schema.ts';

/** The days the week's audit looks back. */
export const WEEK = 8;

export async function weekAudit(
  notes: Note[],
  schema: Schema,
  since: (day: string) => Promise<History>,
) {
  const t = today();
  const day = daysBefore(t, WEEK);
  return audit(notes, schema, await since(day), t, day, `${WEEK} days ago`);
}

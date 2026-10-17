import { z } from 'zod';
import type { HistoricalReference, TransactionContext } from '@/vault/eav/index.ts';
import type { CalendarDatabase, EventRef, AnnualDateRef } from './schema.ts';
import { parseTime, daysInMonth, type TimeValue } from './time.ts';

const description = z
  .object({
    title: z.string().trim().min(1),
    description: z.string(),
    status: z.enum(['planned', 'occurred', 'cancelled', 'unknown']),
  })
  .strict();
export interface EventInput {
  title: string;
  description: string;
  status: 'planned' | 'occurred' | 'cancelled' | 'unknown';
  time: TimeValue;
  reportedTime?: TimeValue;
  roles?: readonly {
    subject: HistoricalReference;
    kind: 'participant' | 'place';
    role: string;
    order: number;
  }[];
  sources?: readonly HistoricalReference[];
}

/** Each event and its qualified roles/provenance are admitted together. */
export function createEvent(
  db: CalendarDatabase,
  input: EventInput,
  context: TransactionContext = {},
): Promise<EventRef> {
  const fields = description.parse({
    title: input.title,
    description: input.description,
    status: input.status,
  });
  const time = parseTime(input.time);
  const reportedTime = input.reportedTime === undefined ? undefined : parseTime(input.reportedTime);
  const roles = (input.roles ?? []).map((role) => ({
    ...role,
    ...z
      .object({
        kind: z.enum(['participant', 'place']),
        role: z.string().trim().min(1),
        order: z.number().int().nonnegative(),
      })
      .parse(role),
  }));
  return db.transaction(context, async (tx) => {
    const event = await tx.entities.calendarEvents.insert({
      ...fields,
      time,
      ...(reportedTime && { reportedTime }),
      available: true,
    });
    await Promise.all(
      roles.map((role) => tx.entities.calendarEventRoles.insert({ event, ...role })),
    );
    await Promise.all(
      (input.sources ?? []).map((source) =>
        tx.entities.calendarEventSources.insert({ event, source }),
      ),
    );
    return event;
  });
}

/** Explicit revisions preserve the previous plan/status in EAV history. */
export function reviseEvent(
  db: CalendarDatabase,
  event: EventRef,
  patch: Partial<Pick<EventInput, 'title' | 'description' | 'status' | 'time' | 'reportedTime'>>,
  context: TransactionContext = {},
): Promise<void> {
  const fields = description
    .partial()
    .parse(
      Object.fromEntries(
        Object.entries(patch).filter(([key]) => ['title', 'description', 'status'].includes(key)),
      ),
    );
  const time = patch.time === undefined ? undefined : parseTime(patch.time);
  const reportedTime = patch.reportedTime === undefined ? undefined : parseTime(patch.reportedTime);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.calendarEvents.get(event, { select: { available: true } });
    if (!current?.available) throw new Error('Event is unavailable');
    await tx.entities.calendarEvents.update({
      ...current,
      ...fields,
      ...(time && { time }),
      ...(reportedTime && { reportedTime }),
    });
  });
}

export function removeEvent(
  db: CalendarDatabase,
  event: EventRef,
  context: TransactionContext = {},
): Promise<void> {
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.calendarEvents.get(event, { select: {} });
    if (!current) throw new Error('Event is unavailable');
    await tx.entities.calendarEvents.update({ ...current, available: false });
  });
}

export function createAnnualDate(
  db: CalendarDatabase,
  input: {
    title: string;
    month: number;
    day: number;
    subject?: HistoricalReference;
    expression?: string;
  },
  context: TransactionContext = {},
): Promise<AnnualDateRef> {
  const fields = z
    .object({
      title: z.string().trim().min(1),
      month: z.number().int().min(1).max(12),
      day: z.number().int().min(1).max(31),
      expression: z.string().optional(),
    })
    .parse(input);
  if (fields.day > daysInMonth(2000, fields.month)) throw new Error('Invalid annual date');
  return db.transaction(context, (tx) =>
    tx.entities.calendarAnnualDates.insert({
      ...fields,
      ...(input.subject && { subject: input.subject }),
      available: true,
    }),
  );
}

export function reviseAnnualDate(
  db: CalendarDatabase,
  annualDate: AnnualDateRef,
  patch: { title?: string; month?: number; day?: number; expression?: string; available?: boolean },
  context: TransactionContext = {},
): Promise<void> {
  const fields = z
    .object({
      title: z.string().trim().min(1).optional(),
      month: z.number().int().min(1).max(12).optional(),
      day: z.number().int().min(1).max(31).optional(),
      expression: z.string().optional(),
      available: z.boolean().optional(),
    })
    .strict()
    .parse(patch);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.calendarAnnualDates.get(annualDate, {
      select: { month: true, day: true },
    });
    if (!current) throw new Error('Annual date is unavailable');
    const updated = { ...current, ...fields };
    if (updated.day > daysInMonth(2000, updated.month)) throw new Error('Invalid annual date');
    await tx.entities.calendarAnnualDates.update(updated);
  });
}

import { z } from 'zod';
import {
  clear,
  sameEntity,
  type RetainedStateReference,
  type TransactionContext,
  type TransactionRef,
  type Transaction,
} from '@/core/store/index.ts';
import type {
  CalendarDatabase,
  ChronologyRef,
  ChronologyItemRef,
  ChronologyPlacementRef,
  calendarEntities,
} from './records.ts';
import { parseTime, type TimeValue } from './time.ts';

interface ChronologyFields {
  label?: string;
  context?: RetainedStateReference;
  provenance?: RetainedStateReference;
  available?: boolean;
}
export type ChronologyInput = ChronologyFields &
  (
    | { kind: 'collection'; time?: never; recurrence?: never }
    | { kind: 'date-context'; time: TimeValue; recurrence?: 'yearly' }
  );
export interface ChronologyItemInput {
  target: RetainedStateReference;
  /** Ordered placement token, retained exactly rather than interpreted as chronology. */
  order: string;
  provenance?: RetainedStateReference;
  available?: boolean;
}

function parseChronology(input: ChronologyInput) {
  const fields = z
    .object({
      kind: z.enum(['collection', 'date-context']),
      label: z.string().optional(),
      recurrence: z.enum(['yearly']).optional(),
      available: z.boolean().default(true),
    })
    .parse(input);
  const time = input.time === undefined ? undefined : parseTime(input.time);
  if (fields.kind === 'date-context' && !time) throw new Error('Date context requires time');
  if (fields.kind === 'collection' && (time || fields.recurrence))
    throw new Error('Chronology collection cannot assert a date or recurrence');
  // Recurrence retains the recorded rule independently of its civil anchor; no occurrences generated.
  return {
    ...fields,
    ...(time === undefined ? {} : { time }),
    ...(input.context === undefined ? {} : { context: input.context }),
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
  };
}
function parseItem(input: ChronologyItemInput) {
  return {
    ...z.object({ order: z.string().min(1), available: z.boolean().default(true) }).parse(input),
    target: input.target,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
  };
}

/** A collection/date bucket and its known endpoint selections are admitted atomically. */
export function createChronology(
  db: CalendarDatabase,
  input: ChronologyInput,
  items: readonly ChronologyItemInput[] = [],
  context: TransactionContext = {},
): Promise<ChronologyRef> {
  // Validate before opening the transaction, then share the public transactional admission.
  parseChronology(input);
  for (const item of items) parseItem(item);
  return db.transaction(context, (tx) => chronologyAdmission(tx).create(input, items));
}

/** A full recorded revision can restore availability and explicitly remove optional metadata. */
export function reviseChronology(
  db: CalendarDatabase,
  chronology: ChronologyRef,
  input: ChronologyInput,
  context: TransactionContext = {},
): Promise<void> {
  parseChronology(input);
  return db.transaction(context, (tx) => chronologyAdmission(tx).revise(chronology, input));
}

export function createChronologyItem(
  db: CalendarDatabase,
  chronology: ChronologyRef,
  input: ChronologyItemInput,
  context: TransactionContext = {},
): Promise<ChronologyItemRef> {
  const fields = parseItem(input);
  return db.transaction(context, async (tx) => {
    const parent = await tx.entities.calendarChronologies.get(chronology, { select: {} });
    if (!parent) throw new Error('Chronology is unavailable');
    return tx.entities.calendarChronologyItems.insert({ chronology, ...fields });
  });
}

export function reviseChronologyItem(
  db: CalendarDatabase,
  item: ChronologyItemRef,
  input: ChronologyItemInput,
  context: TransactionContext = {},
): Promise<void> {
  const fields = parseItem(input);
  return db.transaction(context, async (tx) => {
    const current = await tx.entities.calendarChronologyItems.get(item, { select: {} });
    if (!current) throw new Error('Chronology item is unavailable');
    await tx.entities.calendarChronologyItems.update({ ...current, provenance: clear, ...fields });
  });
}

export interface ChronologyQuery {
  snapshot?: TransactionRef;
  chronology?: ChronologyRef;
  includeUnavailable?: boolean;
}
/** Read all buckets and ordered items from the same accepted snapshot. */
export async function readChronologies(db: CalendarDatabase, query: ChronologyQuery = {}) {
  const snapshot =
    query.snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  const view = snapshot ? db.at(snapshot) : db;
  const [records, items] = await Promise.all([
    view.entities.calendarChronologies.query({
      limit: null, // Collection filtering and joins must see all retained date contexts.
      select: {
        kind: true,
        label: true,
        time: true,
        recurrence: true,
        context: true,
        provenance: true,
        available: true,
      },
      where: query.includeUnavailable ? undefined : { available: { eq: true } },
    }),
    view.entities.calendarChronologyItems.query({
      limit: null, // Preserve the complete ordered endpoint list for each collection.
      select: { chronology: true, target: true, order: true, provenance: true, available: true },
      where: query.includeUnavailable ? undefined : { available: { eq: true } },
      orderBy: [{ order: 'asc' }],
    }),
  ]);
  return records
    .filter((record) => !query.chronology || sameEntity(record, query.chronology))
    .map((record) => ({
      ...record,
      ref: record,
      time: record.time === undefined ? undefined : parseTime(record.time),
      items: items.filter((item) => sameEntity(item.chronology, record)),
    }));
}

export interface ChronologyPlacementInput {
  parent: RetainedStateReference;
  child: RetainedStateReference;
  order: string;
  provenance?: RetainedStateReference;
  available?: boolean;
}
function parsePlacement(input: ChronologyPlacementInput) {
  return {
    ...z.object({ order: z.string().min(1), available: z.boolean().default(true) }).parse(input),
    parent: input.parent,
    child: input.child,
    ...(input.provenance === undefined ? {} : { provenance: input.provenance }),
  };
}

/** Caller owns the transaction, so original owner changes can share one admission boundary. */
export function chronologyAdmission(tx: Transaction<typeof calendarEntities>) {
  return {
    create: async (input: ChronologyInput, items: readonly ChronologyItemInput[] = []) => {
      const fields = parseChronology(input);
      const members = items.map(parseItem);
      const chronology = await tx.entities.calendarChronologies.insert(fields);
      await Promise.all(
        members.map((member) =>
          tx.entities.calendarChronologyItems.insert({ chronology, ...member }),
        ),
      );
      return chronology;
    },
    revise: async (chronology: ChronologyRef, input: ChronologyInput) => {
      const fields = parseChronology(input);
      const current = await tx.entities.calendarChronologies.get(chronology, { select: {} });
      if (!current) throw new Error('Chronology is unavailable');
      await tx.entities.calendarChronologies.update({
        ...current,
        label: clear,
        time: clear,
        recurrence: clear,
        context: clear,
        provenance: clear,
        ...fields,
      });
    },
    place: (input: ChronologyPlacementInput): Promise<ChronologyPlacementRef> =>
      tx.entities.calendarChronologyPlacements.insert(parsePlacement(input)),
    revisePlacement: async (placement: ChronologyPlacementRef, input: ChronologyPlacementInput) => {
      const fields = parsePlacement(input);
      const current = await tx.entities.calendarChronologyPlacements.get(placement, { select: {} });
      if (!current) throw new Error('Chronology placement is unavailable');
      await tx.entities.calendarChronologyPlacements.update({
        ...current,
        provenance: clear,
        ...fields,
      });
    },
  };
}

export interface ChronologyClosureQuery {
  snapshot?: TransactionRef;
  includeUnavailable?: boolean;
}
/** Membership is read at the requested cutoff; endpoints retain the exact recorded selections. */
export async function readChronologyClosure(
  db: CalendarDatabase,
  parent: RetainedStateReference,
  query: ChronologyClosureQuery = {},
) {
  const selectedParent = await db.history.resolveRetainedState(parent);
  const snapshot =
    query.snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  const view = snapshot ? db.at(snapshot) : db;
  const placements = await view.entities.calendarChronologyPlacements.query({
    limit: null, // Historical containment can join children owned by any registered module.
    select: { parent: true, child: true, order: true, provenance: true, available: true },
    where: query.includeUnavailable ? undefined : { available: { eq: true } },
    orderBy: [{ order: 'asc' }],
  });
  const resolved = await Promise.all(
    placements.map(async (placement) => {
      const actualParent = await db.history.resolveRetainedState(placement.parent);
      if (!sameEntity(actualParent.entity, selectedParent.entity)) return [];
      const child = await db.history.resolveRetainedState(placement.child);
      return [
        {
          ...placement,
          ref: placement,
          parentState: actualParent.state,
          childState: child.state,
          recordedChild: await retainedFields(db, placement.child),
        },
      ];
    }),
  );
  return resolved.flat();
}

/** Deleted selection stays deleted while exposing its final retained values for historical reading. */
async function retainedFields(db: CalendarDatabase, reference: RetainedStateReference) {
  const selected = await db.history.resolveRetainedState(reference);
  if (selected.state === 'live') return db.history.inspect(selected.transaction, selected.entity);
  const cutoff = await db.history.transactions.get(selected.transaction, {
    select: { sequence: true },
  });
  const transactions = await db.history.transactions.query({
    limit: null, // A deleted record's final fields come from its last change before the selected cutoff.
    select: {},
    where: { sequence: { lt: cutoff!.sequence + 1 } },
    orderBy: [{ sequence: 'desc' }],
  });
  const states = await Promise.all(
    transactions.map((transaction) => db.history.inspect(transaction, selected.entity)),
  );
  return states.find((state) => state !== undefined);
}

/** A UI-independent projection combines owner fields, exact endpoint states and ordered closure. */
export async function readChronology(
  db: CalendarDatabase,
  chronology: ChronologyRef,
  query: ChronologyClosureQuery = {},
) {
  const snapshot =
    query.snapshot ??
    (await db.history.transactions.first({ select: {}, orderBy: [{ sequence: 'desc' }] }));
  if (!snapshot) return;
  const [record] = await readChronologies(db, { ...query, snapshot, chronology });
  if (!record) return;
  const reference = await db.history.retainedStateReference(snapshot, chronology);
  const closure = await readChronologyClosure(db, reference, { ...query, snapshot });
  const items = await Promise.all(
    record.items.map(async (item) => ({
      ...item,
      childState: (await db.history.resolveRetainedState(item.target)).state,
      recordedChild: await retainedFields(db, item.target),
    })),
  );
  return { ...record, items, closure };
}

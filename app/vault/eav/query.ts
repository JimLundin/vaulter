import { resolveReference } from './references.ts';
import { encodeJson, decodeJson } from './json.ts';
import type { EntityDefinition, FieldDefinition } from './schema.ts';
import { attributeKey } from './schema.ts';
import { identify, materialize, type Issuance } from './identity.ts';
import {
  atomKey,
  isLive,
  recordType,
  type Atom,
  type MemoryStorage,
  type RecordState,
  type Snapshot,
} from './memory.ts';

export interface QueryContext {
  readonly storage: MemoryStorage;
  readonly definitions: ReadonlyMap<string, EntityDefinition>;
  readonly snapshot: Snapshot;
  readonly sequence: number;
  readonly issuance?: Issuance;
}
export interface QueryInput {
  readonly select: unknown;
  readonly where?: unknown;
  readonly orderBy?: unknown;
  readonly after?: unknown;
  readonly limit?: number | null;
}

export function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date)
    throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
export function keys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unknown ${label}: ${key}`);
}
/** Collection queries are bounded unless the owning caller explicitly needs a complete read. */
export const DEFAULT_QUERY_LIMIT = 100;
export function limit(value: unknown): number {
  if (value === undefined) return DEFAULT_QUERY_LIMIT;
  if (value === null) return Number.POSITIVE_INFINITY;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Query limit must be a nonnegative safe integer or null');
  return value;
}
export function scalar(definition: FieldDefinition, value: unknown): Atom {
  switch (definition.kind) {
    case 'historical':
      throw new Error('Historical references require database validation');
    case 'json':
      return { json: encodeJson(value) };
    case 'string':
      if (typeof value === 'string') return value;
      break;
    case 'number':
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      break;
    case 'boolean':
      if (typeof value === 'boolean') return value;
      break;
    case 'enum':
      if (typeof value === 'string' && definition.values!.includes(value)) return value;
      break;
    case 'datetime':
      if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
      break;
    default:
      break;
  }
  throw new Error(`Expected ${definition.kind} attribute value`);
}
export function reference(
  context: QueryContext,
  definition: FieldDefinition,
  value: unknown,
): Atom {
  const identity = identify(
    context.storage,
    value,
    definition.target!.name === '@any' ? undefined : definition.target!.name,
  );
  return { ref: identity.id, type: identity.type };
}
function memberDefinition(definition: FieldDefinition): FieldDefinition {
  return definition.kind === 'set' ? definition.member! : definition;
}
function target(context: QueryContext, definition: FieldDefinition): EntityDefinition {
  return context.definitions.get(definition.target!.name) ?? definition.target!;
}
export function validateSelection(
  // biome-ignore lint/suspicious/noParametersOnlyUsedInRecursion: Each level resolves its target through the registered definitions.
  context: QueryContext,
  entity: EntityDefinition,
  input: unknown,
  depth = 0,
): void {
  if (depth > 64) throw new Error('Query selection is too deep or recursive');
  const selection = object(input, 'Selection');
  keys(selection, Object.keys(entity.fields), 'selected attribute');
  for (const [name, selected] of Object.entries(selection)) {
    const definition = memberDefinition(entity.fields[name]!.definition);
    if (selected === true) continue;
    if (definition.kind !== 'ref' && definition.kind !== 'inverse')
      throw new Error(`Scalar selection must be true: ${name}`);
    validateSelection(context, target(context, definition), selected, depth + 1);
  }
}

export function valuesFor(
  context: QueryContext,
  entity: EntityDefinition,
  id: string,
  record: RecordState,
  name: string,
): readonly Atom[] {
  const definition = entity.fields[name]!.definition;
  if (definition.kind !== 'inverse')
    return record.get(attributeKey(entity.name, name, definition)) ?? [];
  const source = target(context, definition);
  const forward = source.fields[definition.forward!]!.definition;
  const key = attributeKey(source.name, definition.forward!, forward);
  const values: Atom[] = [];
  for (const [candidateId, candidate] of context.snapshot)
    if (
      isLive(candidate) &&
      recordType(candidate) === source.name &&
      candidate
        .get(key)
        ?.some((value) => typeof value === 'object' && 'ref' in value && value.ref === id)
    )
      values.push({ ref: candidateId, type: source.name });
  return values.sort((a, b) => atomKey(a).localeCompare(atomKey(b)));
}

function projectValue(
  context: QueryContext,
  definition: FieldDefinition,
  atom: Atom,
  selection: unknown,
): unknown {
  if (definition.kind === 'ref' || definition.kind === 'inverse') {
    if (typeof atom !== 'object' || !('ref' in atom)) throw new Error('Corrupt reference');
    const resolved = context.snapshot.get(atom.ref);
    if (!isLive(resolved)) throw new Error('Reference target is unavailable in this snapshot');
    const entity = context.definitions.get(atom.type) ?? target(context, definition);
    return project(context, entity, atom.ref, resolved, selection === true ? {} : selection);
  }
  if (definition.kind === 'historical') {
    if (typeof atom !== 'object' || !('history' in atom))
      throw new Error('Corrupt historical reference');
    const address = decodeJson(atom.history);
    resolveReference(context.storage, address);
    return address;
  }
  if (definition.kind === 'json') {
    if (typeof atom !== 'object' || !('json' in atom)) throw new Error('Corrupt JSON');
    return decodeJson(atom.json);
  }
  return definition.kind === 'datetime' ? new Date(atom as number) : atom;
}
export function project(
  context: QueryContext,
  entity: EntityDefinition,
  id: string,
  record: RecordState,
  input: unknown,
): object {
  const selection = object(input, 'Selection');
  const fields = Object.fromEntries(
    Object.entries(selection).flatMap(([name, selected]) => {
      const definition = entity.fields[name]!.definition;
      const values = valuesFor(context, entity, id, record, name);
      if (definition.kind === 'set' || definition.kind === 'inverse') {
        // Required empty sets are real empty values; an optional absent set is omitted.
        const key = attributeKey(entity.name, name, definition);
        if (definition.optional && !record.has(key) && !record.has(`@has:${key}`)) return [];
        return [
          [
            name,
            Object.freeze(
              values.map((atom) =>
                projectValue(context, memberDefinition(definition), atom, selected),
              ),
            ),
          ],
        ];
      }
      if (!values.length) return [];
      return [[name, projectValue(context, definition, values[0]!, selected)]];
    }),
  );
  return materialize(
    {
      database: context.storage,
      id,
      type: entity.name,
      sequence: context.sequence,
      ...(context.issuance && { issuance: context.issuance }),
    },
    fields,
  );
}

function predicateAtom(context: QueryContext, definition: FieldDefinition, value: unknown): Atom {
  if (definition.kind === 'historical') {
    resolveReference(context.storage, value);
    return { history: encodeJson(value) };
  }
  return scalar(definition, value);
}

function validatePredicate(
  context: QueryContext,
  definition: FieldDefinition,
  input: unknown,
  depth: number,
): void {
  const predicate = object(input, 'Predicate');
  if (definition.kind === 'inverse') {
    keys(predicate, ['some'], 'inverse predicate');
    if ('some' in predicate)
      validateWhere(context, target(context, definition), predicate.some, depth + 1);
    return;
  }
  if (definition.kind === 'set') {
    keys(predicate, ['some'], 'set predicate');
    if ('some' in predicate)
      validatePredicate(context, definition.member!, predicate.some, depth + 1);
    return;
  }
  if (definition.kind === 'ref') {
    keys(predicate, ['eq', 'matches'], 'reference predicate');
    if ('eq' in predicate) reference(context, definition, predicate.eq);
    if ('matches' in predicate)
      validateWhere(context, target(context, definition), predicate.matches, depth + 1);
    return;
  }
  const ordered = definition.kind === 'number' || definition.kind === 'datetime';
  keys(
    predicate,
    [
      'eq',
      'in',
      ...(ordered
        ? ['gte', 'lt']
        : definition.kind === 'string' || definition.kind === 'enum'
          ? ['contains']
          : []),
    ],
    'scalar predicate',
  );
  for (const [operation, value] of Object.entries(predicate)) {
    if (operation === 'in') {
      if (!Array.isArray(value)) throw new Error('in requires an array');
      for (const item of value) predicateAtom(context, definition, item);
    } else if (operation === 'contains') {
      if (typeof value !== 'string') throw new Error('contains requires text');
    } else predicateAtom(context, definition, value);
  }
}
export function validateWhere(
  context: QueryContext,
  entity: EntityDefinition,
  input: unknown,
  depth = 0,
): void {
  if (depth > 64) throw new Error('Query predicate is too deep or recursive');
  const where = object(input, 'Where');
  keys(where, [...Object.keys(entity.fields), 'and', 'or', 'not'], 'predicate attribute');
  for (const [name, value] of Object.entries(where)) {
    if (name === 'and' || name === 'or') {
      if (!Array.isArray(value)) throw new Error(`${name} requires an array`);
      for (const item of value) validateWhere(context, entity, item, depth + 1);
    } else if (name === 'not') validateWhere(context, entity, value, depth + 1);
    else validatePredicate(context, entity.fields[name]!.definition, value, depth + 1);
  }
}

function matchesValue(
  context: QueryContext,
  definition: FieldDefinition,
  values: readonly Atom[],
  input: unknown,
): boolean {
  const predicate = object(input, 'Predicate');
  if (definition.kind === 'inverse')
    return (
      !('some' in predicate) ||
      values.some((atom) => {
        if (typeof atom !== 'object' || !('ref' in atom)) return false;
        const record = context.snapshot.get(atom.ref);
        return (
          isLive(record) &&
          matches(context, target(context, definition), atom.ref, record, predicate.some)
        );
      })
    );
  if (definition.kind === 'set')
    return (
      !('some' in predicate) ||
      values.some((atom) => matchesValue(context, definition.member!, [atom], predicate.some))
    );
  const value = values[0];
  if (value === undefined) return false;
  for (const [operation, expected] of Object.entries(predicate)) {
    if (definition.kind === 'ref') {
      if (typeof value !== 'object' || !('ref' in value)) return false;
      if (
        operation === 'eq' &&
        atomKey(reference(context, definition, expected)) !== atomKey(value)
      )
        return false;
      if (operation === 'matches') {
        const record = context.snapshot.get(value.ref);
        if (
          !(
            isLive(record) &&
            matches(context, target(context, definition), value.ref, record, expected)
          )
        )
          return false;
      }
    } else if (operation === 'in') {
      if (
        !(expected as unknown[]).some(
          (item) => atomKey(predicateAtom(context, definition, item)) === atomKey(value),
        )
      )
        return false;
    } else {
      const other =
        operation === 'contains' ? String(expected) : predicateAtom(context, definition, expected);
      if (operation === 'eq' && atomKey(value) !== atomKey(other)) return false;
      if (operation === 'gte' && !(value >= other)) return false;
      if (operation === 'lt' && !(value < other)) return false;
      if (operation === 'contains' && !String(value).includes(String(other))) return false;
    }
  }
  return true;
}
export function matches(
  context: QueryContext,
  entity: EntityDefinition,
  id: string,
  record: RecordState,
  input: unknown,
): boolean {
  const where = object(input, 'Where');
  return Object.entries(where).every(([name, value]) => {
    if (name === 'and')
      return (value as unknown[]).every((part) => matches(context, entity, id, record, part));
    if (name === 'or')
      return (value as unknown[]).some((part) => matches(context, entity, id, record, part));
    if (name === 'not') return !matches(context, entity, id, record, value);
    return matchesValue(
      context,
      entity.fields[name]!.definition,
      valuesFor(context, entity, id, record, name),
      value,
    );
  });
}

/** Filter and order before projecting, including for first(). Stable ties use internal identities. */
export async function selectRecords(
  context: QueryContext,
  entity: EntityDefinition,
  input: QueryInput,
  first: boolean,
): Promise<[string, RecordState][]> {
  const options = object(input, 'Query');
  keys(
    options,
    ['select', 'where', 'orderBy', 'after', ...(first ? [] : ['limit'])],
    'query option',
  );
  validateSelection(context, entity, input.select);
  if (input.where !== undefined) validateWhere(context, entity, input.where);
  const take = first ? 1 : limit(input.limit);
  const order: [string, 'asc' | 'desc'][] = [];
  if (input.orderBy !== undefined) {
    if (!Array.isArray(input.orderBy)) throw new Error('orderBy requires an array');
    for (const part of input.orderBy) {
      for (const [name, direction] of Object.entries(object(part, 'Order'))) {
        const definition = entity.fields[name]?.definition;
        if (
          !definition ||
          ['ref', 'set', 'inverse', 'json', 'historical'].includes(definition.kind)
        )
          throw new Error(`Cannot order by ${name}`);
        if (direction !== 'asc' && direction !== 'desc')
          throw new Error('Order must be asc or desc');
        order.push([name, direction]);
      }
    }
  }
  const compare = (a: [string, RecordState], b: [string, RecordState]) => {
    for (const [name, direction] of order) {
      const left = valuesFor(context, entity, a[0], a[1], name)[0];
      const right = valuesFor(context, entity, b[0], b[1], name)[0];
      const compared =
        left === right
          ? 0
          : left === undefined
            ? -1
            : right === undefined
              ? 1
              : left < right
                ? -1
                : 1;
      if (compared) return direction === 'asc' ? compared : -compared;
    }
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
  };
  let after: [string, RecordState] | undefined;
  if (input.after !== undefined) {
    const identity = identify(context.storage, input.after, entity.name);
    if (identity.sequence !== context.sequence)
      throw new Error('Pagination requires the same database snapshot');
    const record = context.snapshot.get(identity.id);
    if (!isLive(record)) throw new Error('Pagination cursor is unavailable');
    after = [identity.id, record];
  }
  if (take === 0) return [];
  // Keep only the best K matches: the root is the largest retained value.
  // Stable identity ordering still requires visiting every candidate, even without orderBy.
  const found: [string, RecordState][] = [];
  let scanned = 0;
  for (const [id, record] of context.snapshot) {
    if (++scanned % 512 === 0) await queryYield();
    if (
      !isLive(record) ||
      recordType(record) !== entity.name ||
      (input.where !== undefined && !matches(context, entity, id, record, input.where))
    )
      continue;
    const item: [string, RecordState] = [id, record];
    if (after && compare(item, after) <= 0) continue;
    if (take === Number.POSITIVE_INFINITY) {
      found.push(item);
      continue;
    }
    if (found.length < take) {
      found.push(item);
      let child = found.length - 1;
      while (child > 0) {
        const parent = (child - 1) >> 1;
        if (compare(found[parent]!, found[child]!) >= 0) break;
        [found[parent], found[child]] = [found[child]!, found[parent]!];
        child = parent;
      }
    } else if (compare(item, found[0]!) < 0) {
      found[0] = item;
      let parent = 0;
      while (parent * 2 + 1 < found.length) {
        let child = parent * 2 + 1;
        if (child + 1 < found.length && compare(found[child + 1]!, found[child]!) > 0) child++;
        if (compare(found[parent]!, found[child]!) >= 0) break;
        [found[parent], found[child]] = [found[child]!, found[parent]!];
        parent = child;
      }
    }
  }
  return found.sort(compare);
}

/** Yield to browser input/paint as well as Node callers; a microtask alone cannot do that. */
export const queryYield = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

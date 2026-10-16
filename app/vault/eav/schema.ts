import type { JsonValue } from './json.ts';

/** Declarative definitions carry both inference and a serializable schema. */
declare const valueType: unique symbol;

export interface Field<K extends string, V, O extends boolean = false> {
  readonly kind: K;
  readonly [valueType]?: V;
  readonly isOptional: O;
  readonly definition: FieldDefinition;
  optional: () => Field<K, V, true>;
  key: (identity: string) => Field<K, V, O>;
}

export interface FieldDefinition {
  readonly kind:
    | 'string'
    | 'number'
    | 'boolean'
    | 'datetime'
    | 'json'
    | 'enum'
    | 'ref'
    | 'set'
    | 'inverse';
  readonly optional: boolean;
  readonly key?: string;
  readonly values?: readonly string[];
  readonly target?: EntityDefinition;
  readonly member?: FieldDefinition;
  readonly forward?: string;
}

export type AnyField =
  | Field<'scalar', unknown, boolean>
  | Field<'json', JsonValue, boolean>
  | Field<'ref', EntityDefinition, boolean>
  | Field<'set', AnyField, boolean>
  | Field<'inverse', EntityDefinition, boolean>;

export interface EntityDefinition {
  readonly name: string;
  readonly fields: Readonly<Record<string, AnyField>>;
}

export interface Entity<N extends string, F extends EntityDefinition['fields']>
  extends EntityDefinition {
  readonly name: N;
  readonly fields: F;
  extend: <const Added extends EntityDefinition['fields']>(fields: Added) => Entity<N, F & Added>;
}

function field<K extends string, V, O extends boolean>(
  kind: K,
  definition: FieldDefinition & { readonly optional: O },
): Field<K, V, O> {
  // The phantom type has no runtime representation; all runtime meaning lives in definition.
  Object.freeze(definition);
  const result: Field<K, V, O> = {
    kind,
    isOptional: definition.optional,
    definition,
    optional: () => field<K, V, true>(kind, { ...definition, optional: true }),
    key: (identity: string) => {
      nonempty(identity, 'Attribute identity');
      return field<K, V, O>(kind, { ...definition, key: identity });
    },
  };
  return Object.freeze(result);
}

function entity<const N extends string, const F extends EntityDefinition['fields']>(
  name: N,
  fields: F,
): Entity<N, F> {
  nonempty(name, 'Entity type');
  return Object.freeze({
    name,
    fields: Object.freeze({ ...fields }),
    extend: <const Added extends EntityDefinition['fields']>(added: Added) => {
      for (const key of Object.keys(added))
        if (Object.hasOwn(fields, key)) throw new Error(`Attribute already defined: ${key}`);
      return entity(name, { ...fields, ...added });
    },
  });
}

function nonempty(value: string, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be nonempty`);
}

type ReferenceKeys<E extends EntityDefinition> = {
  [K in keyof E['fields']]: E['fields'][K] extends Field<'ref', EntityDefinition, boolean>
    ? K
    : E['fields'][K] extends Field<'set', Field<'ref', EntityDefinition, boolean>, boolean>
      ? K
      : never;
}[keyof E['fields']];

export const e = {
  json: () => field<'json', JsonValue, false>('json', { kind: 'json', optional: false }),
  string: () => field<'scalar', string, false>('scalar', { kind: 'string', optional: false }),
  number: () => field<'scalar', number, false>('scalar', { kind: 'number', optional: false }),
  boolean: () => field<'scalar', boolean, false>('scalar', { kind: 'boolean', optional: false }),
  datetime: () => field<'scalar', Date, false>('scalar', { kind: 'datetime', optional: false }),
  enum: <const V extends readonly [string, ...string[]]>(...values: V) => {
    if (!values.length) throw new Error('Enum requires at least one value');
    if (new Set(values).size !== values.length) throw new Error('Enum values must be distinct');
    return field<'scalar', V[number], false>('scalar', {
      kind: 'enum',
      optional: false,
      values: Object.freeze([...values]),
    });
  },
  ref: <E extends EntityDefinition>(target: E) =>
    field<'ref', E, false>('ref', { kind: 'ref', optional: false, target }),
  set: <F extends AnyField>(member: F) => {
    if (member.isOptional || member.kind === 'set' || member.kind === 'inverse')
      throw new Error('Set members must be required scalar values or references');
    return field<'set', F, false>('set', {
      kind: 'set',
      optional: false,
      member: member.definition,
    });
  },
  inverse: <E extends EntityDefinition>(target: E, forward: ReferenceKeys<E> & string) =>
    field<'inverse', E, false>('inverse', { kind: 'inverse', optional: false, target, forward }),
  entity,
  registry: <const R extends Registry>(definitions: R): Readonly<R> => {
    describe(definitions);
    return Object.freeze({ ...definitions });
  },
};

export type Registry = Readonly<Record<string, EntityDefinition>>;

export interface AttributeSchema {
  readonly key: string;
  readonly name: string;
  readonly kind: FieldDefinition['kind'];
  readonly optional: boolean;
  readonly values?: readonly string[];
  readonly target?: string;
  readonly member?: Omit<AttributeSchema, 'name' | 'key'>;
  readonly forward?: string;
}
export interface TypeSchema {
  readonly name: string;
  readonly attributes: readonly AttributeSchema[];
}
export type Schema = readonly TypeSchema[];

export function attributeKey(type: string, name: string, definition: FieldDefinition): string {
  return definition.key ?? `${type}/${name}`;
}

export function describe(registry: Registry): Schema {
  const names = new Set<string>();
  for (const definition of Object.values(registry)) {
    if (definition.name.startsWith('@'))
      throw new Error(`Reserved entity type: ${definition.name}`);
    if (names.has(definition.name)) throw new Error(`Duplicate entity type: ${definition.name}`);
    names.add(definition.name);
  }
  const describeField = (name: string, key: string, input: FieldDefinition): AttributeSchema => {
    if (input.target && !names.has(input.target.name))
      throw new Error(`Unregistered reference type: ${input.target.name}`);
    return {
      name,
      key,
      kind: input.kind,
      optional: input.optional,
      ...(input.values && { values: [...input.values] }),
      ...(input.target && { target: input.target.name }),
      ...(input.forward && {
        forward: attributeKey(
          input.target!.name,
          input.forward,
          input.target!.fields[input.forward]!.definition,
        ),
      }),
      ...(input.member && { member: describeField('', '', input.member) }),
    };
  };
  const schema = Object.values(registry).map((definition) => {
    const keys = new Set<string>();
    const attributes = Object.entries(definition.fields).map(([name, input]) => {
      nonempty(name, 'Attribute name');
      if (['and', 'or', 'not'].includes(name)) throw new Error(`Reserved predicate name: ${name}`);
      const key = attributeKey(definition.name, name, input.definition);
      if (key.startsWith('@')) throw new Error(`Reserved attribute identity: ${key}`);
      if (keys.has(key)) throw new Error(`Duplicate attribute identity: ${key}`);
      keys.add(key);
      if (input.definition.kind === 'inverse') {
        if (input.isOptional) throw new Error('An inverse collection cannot be optional');
        const forward = input.definition.target!.fields[input.definition.forward!]?.definition;
        const target = forward?.kind === 'set' ? forward.member?.target : forward?.target;
        if (!target || target.name !== definition.name)
          throw new Error(`Inverse ${name} must point back to ${definition.name}`);
      }
      return describeField(name, key, input.definition);
    });
    return {
      name: definition.name,
      attributes: attributes.sort((a, b) => a.key.localeCompare(b.key)),
    };
  });
  // A reference's inferred fields must agree with the registered target. Extensions may add fields.
  const pending = Object.values(registry).flatMap((entity) =>
    Object.values(entity.fields).map((field) => field.definition),
  );
  const checked = new Set<EntityDefinition>();
  while (pending.length) {
    const field = pending.pop()!;
    if (field.member) pending.push(field.member);
    if (!field.target || checked.has(field.target)) continue;
    checked.add(field.target);
    const registered = schema.find((entity) => entity.name === field.target!.name)!;
    for (const [name, expected] of Object.entries(field.target.fields)) {
      const declared = describeField(
        name,
        attributeKey(field.target.name, name, expected.definition),
        expected.definition,
      );
      const actual = registered.attributes.find((attribute) => attribute.name === name);
      if (JSON.stringify(actual) !== JSON.stringify(declared))
        throw new Error(
          `Reference definition disagrees with registered attribute: ${field.target.name}/${name}`,
        );
      pending.push(expected.definition);
    }
  }
  return schema.sort((a, b) => a.name.localeCompare(b.name));
}

export class SchemaMismatchError extends Error {
  override readonly name = 'SchemaMismatchError';
  readonly changes: readonly string[];
  constructor(changes: readonly string[]) {
    super(`Schema requires an explicit migration: ${changes.join('; ')}`);
    this.changes = changes;
  }
}

/** The engine never guesses conversions or silently discards registered data. */
export function checkCompatibility(before: Schema, after: Schema): void {
  const changes: string[] = [];
  for (const oldType of before) {
    const nextType = after.find((type) => type.name === oldType.name);
    if (!nextType) {
      changes.push(`removed type ${oldType.name}`);
      continue;
    }
    for (const old of oldType.attributes) {
      const next = nextType.attributes.find((attribute) => attribute.key === old.key);
      if (!next) {
        changes.push(`removed attribute ${old.key}`);
        continue;
      }
      // Renaming the public property with a stable key preserves its meaning.
      const meaning = (attribute: AttributeSchema) =>
        JSON.stringify({
          kind: attribute.kind,
          target: attribute.target,
          member: attribute.member,
          values: attribute.values,
          forward: attribute.forward,
        });
      if (meaning(old) !== meaning(next) || (old.optional && !next.optional))
        changes.push(`changed attribute ${old.key}`);
    }
    for (const next of nextType.attributes)
      if (
        !next.optional &&
        next.kind !== 'inverse' &&
        !oldType.attributes.some((old) => old.key === next.key)
      )
        changes.push(`added required attribute ${next.key}`);
  }
  if (changes.length) throw new SchemaMismatchError(changes);
}

/** Provider payloads are values, never entity identities or navigable relationships. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** Reject lossy JSON conversions, including hidden entity identity and sparse arrays. */
export function encodeJson(input: unknown): string {
  const ancestors = new Set<object>();
  const encode = (value: unknown, depth: number): string => {
    if (depth > 64) throw new Error('JSON value is too deep');
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
      return JSON.stringify(value);
    if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
    if (!value || typeof value !== 'object') throw new Error('Expected a JSON value');
    if (ancestors.has(value)) throw new Error('Cyclic JSON value');
    if (Object.getOwnPropertySymbols(value).length) throw new Error('JSON cannot contain symbols');
    const array = Array.isArray(value);
    if (!(array || [Object.prototype, null].includes(Object.getPrototypeOf(value))))
      throw new Error('JSON requires plain objects');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!(descriptor.enumerable && 'value' in descriptor))
        throw new Error('JSON requires enumerable data properties');
    }
    ancestors.add(value);
    try {
      if (array) {
        if (Object.keys(value).length !== value.length)
          throw new Error('JSON arrays cannot be sparse or have extra properties');
        const parts: string[] = [];
        for (let i = 0; i < value.length; i++) {
          if (!Object.hasOwn(value, i)) throw new Error('JSON arrays cannot be sparse');
          parts.push(encode(descriptors[String(i)]!.value, depth + 1));
        }
        return `[${parts.join(',')}]`;
      }
      return `{${Object.keys(descriptors)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(descriptors[key]!.value, depth + 1)}`)
        .join(',')}}`;
    } finally {
      ancestors.delete(value);
    }
  };
  return encode(input, 0);
}

export function decodeJson(encoded: string): JsonValue {
  const freeze = (value: JsonValue): JsonValue => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  return freeze(JSON.parse(encoded));
}

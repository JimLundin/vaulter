// JSON validation, immutable copies, and stable request digests. No storage dependencies.
/** Canonical valid JSON rejects nonfinite values, cycles, and non-JSON objects. */
export function canonical(value: unknown, ancestors = new Set<object>()): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value !== 'object' || ancestors.has(value))
    throw new Error('Expected finite, acyclic JSON');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Object.keys(value);
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index)))
        throw new Error('Expected dense JSON arrays');
      return `[${value.map((item) => canonical(item, ancestors)).join(',')}]`;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
      throw new Error('Expected plain JSON objects');
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item, ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

/** Hash the canonical request; retry identity does not duplicate its entire content in storage. */
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...result].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

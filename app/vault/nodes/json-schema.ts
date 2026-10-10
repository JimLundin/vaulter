import { z } from 'zod';
import type { JsonObject } from './model.ts';
import { canonical } from './json.ts';

/** Validate JSON without rebuilding objects or dropping ordinary JSON keys such as __proto__. */
export const jsonObject = z.custom<JsonObject>((value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    canonical(value);
    return true;
  } catch {
    return false;
  }
}, 'Invalid JSON object');

/** Validate every own entry while retaining the submitted keys and values. */
export function jsonRecord<Value>(key: z.ZodType<string>, value: z.ZodType<Value>) {
  return z.custom<Readonly<Record<string, Value>>>((input) => {
    if (!jsonObject.safeParse(input).success) return false;
    return Object.entries(input as JsonObject).every(
      ([entryKey, entryValue]) =>
        key.safeParse(entryKey).success && value.safeParse(entryValue).success,
    );
  }, 'Invalid JSON record');
}

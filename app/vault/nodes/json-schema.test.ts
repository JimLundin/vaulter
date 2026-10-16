import { expect, test } from 'vitest';
import { z } from 'zod';
import { jsonObject, jsonRecord } from './json-schema.ts';

test('JSON payload validation retains nested values and ordinary special property names', () => {
  const input = JSON.parse(
    '{"__proto__":{"value":1},"constructor":2,"nested":[null,true,3,"text"]}',
  );
  expect(jsonObject.parse(input)).toBe(input);
});

test.each(
  [
    null,
    true,
    1,
    'text',
    [],
    { value: Number.POSITIVE_INFINITY },
    { value: undefined },
    { value: new Date('2026-10-16T10:00:00Z') },
  ].map((input) => ({ input })),
)('JSON payload validation rejects non-object or non-JSON content $input', ({ input }) => {
  expect(jsonObject.safeParse(input).success).toBe(false);
});

test('JSON payload validation rejects cycles', () => {
  const input: { self?: unknown } = {};
  input.self = input;
  expect(jsonObject.safeParse(input).success).toBe(false);
});

test('JSON records retain empty maps and validate every own key and value', () => {
  const schema = jsonRecord(z.string().min(1), z.string().nullable());
  const input = JSON.parse('{"__proto__":"prior","constructor":null}');
  expect(schema.parse(input)).toBe(input);
  expect(schema.parse({})).toEqual({});
  for (const invalid of [
    [],
    true,
    { valid: 'prior', '': 'prior' },
    { valid: 'prior', invalid: 7 },
    JSON.parse('{"valid":"prior","__proto__":7}'),
  ]) {
    expect(schema.safeParse(invalid).success).toBe(false);
  }
});

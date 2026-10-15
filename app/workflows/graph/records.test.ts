import { expect, test } from 'vitest';
import { parseGraphRecord } from './records.ts';

test('Graph retains the imported record shapes, including optional vocabulary semantics', () => {
  const records = [
    { kind: 'relationship', predicate: 'tag', label: 'Original source label' },
    {
      kind: 'term',
      scheme: 'predicate',
      key: 'uses',
      label: 'Uses',
      inverse: 'Used by',
      use: 'Tools',
    },
    { kind: 'term', scheme: 'predicate', key: 'friend', symmetric: true },
    { kind: 'query', type: 'place', tag: 'creative', sort: 'created' },
  ];
  for (const record of records) {
    const parsed = parseGraphRecord(record);
    expect(parsed).toEqual(record);
    expect(parsed).not.toBe(record);
    expect(Object.isFrozen(parsed)).toBe(true);
  }
});

test('Graph rejects foreign records, unknown fields, empty keys and non-JSON input', () => {
  for (const record of [
    { kind: 'page', title: 'Studio' },
    { kind: 'toString' },
    { kind: 'relationship', predicate: '' },
    { kind: 'relationship', predicate: 'tag', target: 'hidden-reference' },
    { kind: 'term', scheme: 'tag', key: '' },
    { kind: 'term', scheme: 'tag', key: 'work', symmetric: 'yes' },
    { kind: 'query', sort: 'updated' },
    { kind: 'query', type: undefined },
  ])
    expect(() => parseGraphRecord(record)).toThrow();
});

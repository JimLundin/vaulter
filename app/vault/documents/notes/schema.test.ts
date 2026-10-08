import { describe, expect, test } from 'vitest';
import { schemaOf, parseSchema } from './schema.ts';
import { checkVault } from '../../validation/check.ts';
import { deriveGraph } from '../graph.ts';
import { loadNotes } from './note.ts';
import { SCHEMA_YAML } from './schema.fixture.ts';

const file = (text: string) => [{ path: 'meta/schema.yaml', text }];
const NOTE = (area: string) =>
  `---\ntype: topic\naliases: []\ntags: [area/${area}, programming]\ncreated: 2026-10-03\nsummary: "A."\n---\n# A\n\n## See also\n`;

describe('schemaOf', () => {
  test("reads the vocabulary in the file's order", () => {
    const s = schemaOf(file(SCHEMA_YAML));
    expect(s.owner).toBe('Owner');
    expect(s.types.map((t) => t.key)).toEqual(['moc', 'topic', 'person']);
    expect(s.areas[1]).toEqual({ key: 'life', label: 'Life', hub: 'Home', use: 'the rest' });
    expect(s.circles[0]).toEqual({ key: 'friends', label: 'Friends', use: '' });
    expect(s.predicates['related-to']).toEqual({
      label: 'Related to',
      symmetric: true,
      use: 'anything',
    });
    expect(s.broadTopics.has('programming')).toBe(true);
    expect(['active', '', 'done', 'other'].map(s.statusRank)).toEqual([0, 1, 2, 0]);
  });
  test('names the file when it is missing', () =>
    expect(() => schemaOf([])).toThrow(/^meta\/schema\.yaml: missing/));
  test('names the file when it is not YAML', () =>
    expect(() => schemaOf(file('types: [a'))).toThrow(/^meta\/schema\.yaml: not valid YAML/));
  test.each([
    ['[]', /must be a map/],
    ['tags: {}', /unknown field "tags"/],
    ['types: [moc]', /types must be a map/],
    ['areas: { work: { use: x } }', /areas\.work\.label must be text/],
    ['areas: { Work: { label: W } }', /areas\.Work: keys are lowercase-hyphenated/],
    ['areas: { work: { label: W, colour: blue } }', /unknown field "colour"/],
    ['predicates: { uses: { label: Uses, use: x } }', /needs an inverse label or symmetric/],
    ['predicates: { uses: { label: Uses, inverse: U, symmetric: true, use: x } }', /not both/],
    ['broad: { craft: [Programming] }', /broad\.craft must be a list/],
    ['components: Chart', /components must be a list/],
    ['components: [chart]', /components must be a list/],
    ['components: [42]', /components must be a list/],
  ])('rejects %s', (yaml, re) => expect(() => schemaOf(file(yaml))).toThrow(re));
  test('existing vaults may keep their legacy component names without changing the vocabulary', () => {
    const files = file(`${SCHEMA_YAML}\ncomponents: [Chart, LocalMap]\n`);
    expect(schemaOf(files).types).toEqual(schemaOf(file(SCHEMA_YAML)).types);
    expect(checkVault([...files, { path: 'A.md', text: NOTE('craft') }]).problems).toEqual([]);
    expect(files[0].text).toContain('components: [Chart, LocalMap]');
  });
  test('a missing section is empty', () => expect(parseSchema({}).areas).toEqual([]));
});

describe("the check uses the vault's schema", () => {
  const vault = (schema: string, area: string) => [
    ...file(schema),
    { path: 'A.md', text: NOTE(area) },
  ];
  const extra = SCHEMA_YAML.replace(
    'areas:\n',
    'areas:\n  garden: { label: Garden, use: plants }\n',
  );
  test('an area the schema adds passes', () =>
    expect(checkVault(vault(extra, 'garden')).problems).toEqual([]));
  test('an area it lacks fails', () =>
    expect(checkVault(vault(SCHEMA_YAML, 'garden')).problems).toEqual([
      'A.md: area/garden is not one of craft, life',
    ]));
  test('without a schema, the check says so', () =>
    expect(checkVault([{ path: 'A.md', text: NOTE('craft') }]).problems).toEqual([
      expect.stringMatching(/^meta\/schema\.yaml: missing/),
    ]));
  test('relations follow its predicates', () => {
    const files = [
      ...file(SCHEMA_YAML),
      {
        path: 'A.md',
        text: NOTE('craft').replace('summary', 'relations: { part-of: [B] }\nsummary'),
      },
      { path: 'B.md', text: NOTE('craft').replace(/# A/, '# B') },
    ];
    expect(checkVault(files).problems).toEqual([]);
    const v = deriveGraph(loadNotes(files), schemaOf(files));
    expect(v.graph.get('B')).toEqual([{ label: 'Parts', notes: [v.byId.get('A')] }]);
  });
});

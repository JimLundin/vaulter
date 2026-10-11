import { expect, test } from 'vitest';
import { SCHEMA_YAML } from '../documents/notes/schema.fixture.ts';
import { checkGraph } from './graph.ts';
import { loadNotes } from '../documents/notes/note.ts';

test('Markdown links and metadata references resolve to existing MDX notes', () => {
  const files = [
    { path: 'meta/schema.yaml', text: SCHEMA_YAML },
    { path: 'Studio.mdx', text: '---\ntype: place\n---\n# Studio' },
    {
      path: 'Index.md',
      text: '---\ntype: topic\nrelations:\n  related-to: [Studio]\n---\n[Studio](/Studio.md) and [direct MDX](/Studio.mdx)',
    },
  ];
  expect(loadNotes(files).map((note) => note.id)).toEqual(['Index', 'Studio']);
  expect(checkGraph(files)).toEqual({ problems: [], ok: 2 });
});

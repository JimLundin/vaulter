// Slots: what a feature adds to another's page comes back typed, with the feature it came from, and
// only to the slot it was added to.
import { expect, test } from 'vitest';
import { EXTENSIONS } from '../extensions/index.ts';
import { noteActions, noteSections } from '../extensions/reader/slots.tsx';
import { slot } from './slot.ts';

test('an entry comes back from its slot, with the extension that added it', () => {
  const shelf = slot<{ title: string }>('test.shelf');
  const box = slot<{ size: number }>('test.box');
  const extensions = [
    { id: 'a', contributes: [shelf.add({ title: 'one' }), box.add({ size: 2 })] },
    { id: 'b', contributes: [shelf.add({ title: 'two' })] },
    { id: 'c' },
  ];
  expect(shelf.of(extensions)).toEqual([
    { from: 'a', entry: { title: 'one' } },
    { from: 'b', entry: { title: 'two' } },
  ]);
  expect(box.of(extensions)).toEqual([{ from: 'a', entry: { size: 2 } }]);
});

test('a slot with the same name is still another slot', () => {
  const first = slot<{ title: string }>('test.same');
  const second = slot<{ title: string }>('test.same');
  expect(second.of([{ id: 'a', contributes: [first.add({ title: 'one' })] }])).toEqual([]);
});

test("a note's sections come from the features that add them, in order", () => {
  const sections = noteSections
    .of(EXTENSIONS)
    .sort((a, b) => a.entry.order - b.entry.order)
    .map(({ from, entry }) => `${entry.order} ${from}`);
  expect(sections).toEqual([
    '10 reader',
    '20 reader',
    '30 decisions',
    '40 reader',
    '50 calendar',
    '60 map',
    '80 reader',
    '90 similar',
  ]);
});

test("a note's footer links come from the editor", () => {
  expect(noteActions.of(EXTENSIONS).map(({ from, entry }) => `${from} ${entry.label}`)).toEqual([
    'editor edit',
    'editor rename',
  ]);
});

// The kit's charts and diff, as markup: what they say, and to whom (the table screen readers get).
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { Bars, CodeDiff, Sparkline } from '../index.ts';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

it('draws bars with the current one in the accent and labelled, and a table of every value', () => {
  const html = renderToStaticMarkup(
    <Bars
      label="Kilometres run per week"
      unit="km"
      data={[
        { label: '22 Sep', value: 12 },
        { label: '29 Sep', value: 31 },
      ]}
    />,
  );
  expect(html.match(/bg-chart-accent/g)).toHaveLength(1);
  expect(html).toContain('aria-label="29 Sep: 31 km"');
  expect(text(html)).toContain('22 Sep 12 km 29 Sep 31 km');
});

it('draws a sparkline whose table names each value', () => {
  const html = renderToStaticMarkup(
    <Sparkline label="Notes per day" unit="notes" values={[3, 5]} labels={['1 Oct', '2 Oct']} />,
  );
  expect(text(html)).toContain('1 Oct 3 notes 2 Oct 5 notes');
});

it('shows a change line by line, with signs, and folds what did not change', () => {
  const before = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
  const after = before.replace('line 10', 'line ten');
  const html = renderToStaticMarkup(<CodeDiff path="a.ts" before={before} after={after} />);
  const t = text(html);
  expect(t).toContain('+1');
  expect(t).toContain('−1');
  expect(t).toContain('− line 10');
  expect(t).toContain('+ line ten');
  // Three lines of context each side; the rest folds.
  expect(t).toContain('⋯ 6 unchanged lines');
  expect(t).toContain('⋯ 7 unchanged lines');
  expect(renderToStaticMarkup(<CodeDiff before="x" after="x" />)).toContain('No changes');
});

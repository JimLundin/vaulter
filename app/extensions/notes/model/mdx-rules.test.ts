import { describe, expect, test } from 'vitest';
import { mdxProblems } from './mdx-rules.ts';
import { literal } from './mdx-literal.ts';

const C = ['NoteList', 'Timeline', 'Chart'];

describe('mdxProblems', () => {
  test('accepts comments', () =>
    expect(mdxProblems('Text {/* note to self */} here\n\n{/* block */}', C)).toEqual([]));
  test('a comment cannot hide code', () =>
    expect(mdxProblems('{/* x */ alert(1)}', C).join()).toMatch(/expressions/));
  test('accepts the components with literal props', () => {
    expect(
      mdxProblems(
        [
          '# Title',
          '',
          '<NoteList type="person" tag="circle/work" excerpt={false} />',
          '',
          '<Chart kind={`bar`} x={["a", "b"]} series={[{name: "n", values: [1.5, -2, null]}, {"name": "m", values: []}]} />',
          '',
          '<Timeline items={[{date: "2026-06-12", text: "Vet", href: "/Ada.md"}]} order="desc" />',
        ].join('\n'),
        C,
      ),
    ).toEqual([]);
  });
  test.each([
    ['import x from "y"', /import\/export/],
    ['export const a = 1', /import\/export/],
    ['{1 + 1}', /expressions are not allowed/],
    ['Text {alert(1)} inline', /expressions are not allowed/],
    ['<div>hi</div>', /<div> is not a component/],
    // biome-ignore lint/security/noSecrets: MDX source the check must refuse, not a secret
    ['<script>alert(1)</script>', /<script> is not a component/],
    ['<NoteList {...props} />', /spread/],
    // biome-ignore lint/security/noSecrets: MDX source the check must refuse, not a secret
    ['<Timeline items={[]}>child</Timeline>', /takes no children/],
    ['<NoteList type={window.name} />', /must be a literal/],
    // biome-ignore lint/security/noSecrets: MDX source the check must refuse, not a secret
    ['<NoteList type={fetch("x")} />', /must be a literal/],
    ['<Chart x={[a]} />', /must be a literal/],
    ['<Chart series={[{[k]: 1}]} />', /must be a literal/],
    ['<Chart series={{__proto__: {}}} />', /must be a literal/],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: a note's text, not a template
    ['<Chart x={`${a}`} />', /must be a literal/],
    ['<Chart x={() => 1} />', /must be a literal/],
    ['<NoteList', /does not parse/],
  ])('%s', (src, re) => {
    expect(mdxProblems(src, C).join('\n')).toMatch(re);
  });
});

describe('literal', () => {
  const expr = (src: string) => {
    const [p] = mdxProblems(`<Chart x={${src}} />`, C);
    return p;
  };
  test('negative numbers and nested values pass', () =>
    expect(expr('[-1, +2, {a: [true, null]}]')).toBeUndefined());
  test('identifiers resolve only through names', () => {
    expect(literal({ type: 'Identifier', name: 'Chart' }, { Chart: 1 })).toBe(1);
    expect(() => literal({ type: 'Identifier', name: 'toString' }, {})).toThrow();
    expect(() => literal({ type: 'Identifier', name: 'window' }, { Chart: 1 })).toThrow();
  });
});

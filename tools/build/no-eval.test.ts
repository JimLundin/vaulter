import { expect, test } from 'vitest';
import { parseSync } from 'vite';
import { usesDynamicCode } from './no-eval.ts';

test('the browser build guard catches direct, indirect and aliased code evaluation', () => {
  for (const code of [
    'eval(source)',
    '(0, eval)(source)',
    'new Function(source)',
    'const F = Function; new F(source)',
    'globalThis.eval(source)',
    'window.Function(source)',
  ])
    expect(usesDynamicCode(parseSync('guard.js', code).program)).toBe(true);
  for (const code of [
    'value instanceof Function',
    'Function.prototype.toString.call(value)',
    'function parse(value) { return JSON.parse(value) }',
    'const text = "unsafe-eval"',
  ])
    expect(usesDynamicCode(parseSync('guard.js', code).program)).toBe(false);
});

// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, test } from 'vitest';
import { DesignComparison } from './design-comparison.tsx';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

test('the focused design label cycles and wraps only its own comparison', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const examples = [
    { id: 'first', label: 'First', content: <p>First page</p> },
    { id: 'second', label: 'Second', content: <p>Second page</p> },
  ] as const;
  act(() =>
    root!.render(
      <>
        <DesignComparison alternatives={examples} />
        <DesignComparison alternatives={examples} />
        <input aria-label="Draft" />
      </>,
    ),
  );
  const labels = host.querySelectorAll<HTMLButtonElement>('button[aria-label="Design variation"]');
  expect(labels).toHaveLength(2);
  const [label, other] = labels;
  label.focus();
  act(() => label.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(label.textContent).toContain('Second');
  expect(other.textContent).toContain('First');
  expect(document.activeElement).toBe(label);
  act(() =>
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  );
  expect(label.textContent).toContain('First');
  const input = host.querySelector('input')!;
  input.focus();
  act(() =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
  );
  expect(label.textContent).toContain('First');
});

test('a sole design has disabled arrows instead of implying another design exists', () => {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root!.render(
      <DesignComparison
        alternatives={[{ id: 'only', label: 'Current design', content: <p>Page</p> }]}
      />,
    ),
  );
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Previous design"]')?.disabled).toBe(
    true,
  );
  expect(host.querySelector<HTMLButtonElement>('[aria-label="Next design"]')?.disabled).toBe(true);
  expect(host.querySelector('[aria-label="Design variation"]')?.textContent).toContain('1 / 1');
});

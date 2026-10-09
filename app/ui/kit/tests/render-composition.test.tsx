// @vitest-environment happy-dom
import { act, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { Button } from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  document.body.replaceChildren();
});

it('renders a button as a link while preserving its content, handlers and ref', () => {
  const clicks: string[] = [];
  let linked: HTMLElement | null = null;
  function Example() {
    const ref = useRef<HTMLElement>(null);
    useEffect(() => {
      linked = ref.current;
    }, []);
    return (
      <Button
        nativeButton={false}
        render={<a href="/history" aria-label="History" onClick={() => clicks.push('link')} />}
        onClick={() => clicks.push('button')}
        ref={ref}
      >
        History
      </Button>
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<Example />));
  const link = host.querySelector('a');
  expect(link?.textContent).toBe('History');
  expect(link?.getAttribute('href')).toBe('/history');
  expect(linked).toBe(link);
  act(() => link!.click());
  expect(clicks).toEqual(['link', 'button']);
  expect(host.querySelector('button')).toBeNull();
});

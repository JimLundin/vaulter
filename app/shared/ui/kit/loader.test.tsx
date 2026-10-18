// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React exports Suspense; TypeScript and the runtime resolve it.
import { act, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { Button, Loader, Text } from './index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

test('a Loader fallback leaves sibling controls available and disappears when content is ready', async () => {
  function Content() {
    return <Text>Your notes are ready.</Text>;
  }
  let release!: (module: { default: typeof Content }) => void;
  const ready = new Promise<{ default: typeof Content }>((resolve) => {
    release = resolve;
  });
  const Notes = lazy(() => ready);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  let clicks = 0;
  try {
    await act(async () => {
      root.render(
        <>
          <Button onClick={() => clicks++}>Settings</Button>
          <Suspense fallback={<Loader />}>
            <Notes />
          </Suspense>
        </>,
      );
    });
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…');
    act(() => host.querySelector('button')!.click());
    expect(clicks).toBe(1);
    await act(async () => {
      release({ default: Content });
      await ready;
    });
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.textContent).toContain('Your notes are ready.');
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

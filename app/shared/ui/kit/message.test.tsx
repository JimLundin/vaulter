// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { Message } from './index.ts';
import { PresentationContext } from './presentation.tsx';

test('compact messages preserve labels when attribution must remain visible', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const portal = document.createElement('div');
  const root = createRoot(document.body);
  try {
    await act(async () =>
      root.render(
        <PresentationContext.Provider value={{ layout: 'compact', portal }}>
          <Message label="Agent" marker="agent">
            Dialogue
          </Message>
          <Message label="Recorded summary" marker="record" persistentLabel={true}>
            Retained source
          </Message>
        </PresentationContext.Provider>,
      ),
    );
    expect(document.querySelector('[data-message="agent"]')?.textContent).toBe('Dialogue');
    expect(document.querySelector('[data-message="record"]')?.textContent).toBe(
      'Recorded summaryRetained source',
    );
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

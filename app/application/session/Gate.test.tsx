// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { VaultGate } from './Gate.tsx';
import type { Session } from './session.ts';

test('startup waits for accepted EAV data, displays cold-load failures and keeps accepted data readable offline', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  const show = (ready: boolean, status: Session['status']) =>
    act(async () =>
      root.render(<VaultGate state={{ ready, status, locked: null }}>Open product</VaultGate>),
    );
  try {
    await show(false, { kind: 'loading' });
    expect(document.body.textContent).toContain('Opening your vault');
    expect(document.body.textContent).not.toContain('Open product');
    await show(false, { kind: 'error', message: 'Vault storage failed.' });
    expect(document.body.textContent).toContain('Vault storage failed.');
    expect(document.body.textContent).not.toContain('Open product');
    await show(false, { kind: 'offline' });
    expect(document.body.textContent).toContain('Connect to load your vault');
    expect(document.body.textContent).not.toContain('Open product');
    for (const status of [
      { kind: 'synced', at: 0 },
      { kind: 'syncing' },
      { kind: 'offline' },
      { kind: 'error', message: 'Refresh failed.' },
    ] as const) {
      await show(true, status);
      expect(document.body.textContent).toBe('Open product');
    }
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

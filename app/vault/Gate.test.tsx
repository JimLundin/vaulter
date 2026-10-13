// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { VaultGate } from './Gate.tsx';

test('Vault readiness renders opening and schema/session failures before admitting its content', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  try {
    await act(async () =>
      root.render(
        <VaultGate
          state={{ files: null, blocked: null, locked: null, status: { kind: 'loading' } }}
        >
          Open product
        </VaultGate>,
      ),
    );
    expect(document.body.textContent).toContain('Opening your vault');
    expect(document.body.textContent).not.toContain('Open product');
    await act(async () =>
      root.render(
        <VaultGate
          state={{
            files: [],
            blocked: 'Invalid schema.',
            locked: null,
            status: { kind: 'synced', at: 0 },
          }}
        >
          Open product
        </VaultGate>,
      ),
    );
    expect(document.body.textContent).toContain('Invalid schema.');
    await act(async () =>
      root.render(
        <VaultGate
          state={{
            files: null,
            blocked: null,
            locked: null,
            status: { kind: 'error', message: 'Storage failed.' },
          }}
        >
          Open product
        </VaultGate>,
      ),
    );
    expect(document.body.textContent).toContain('Storage failed.');
    await act(async () =>
      root.render(
        <VaultGate
          state={{ files: [], blocked: null, locked: null, status: { kind: 'synced', at: 0 } }}
        >
          Open product
        </VaultGate>,
      ),
    );
    expect(document.body.textContent).toBe('Open product');
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

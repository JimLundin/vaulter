// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { SaveError } from '@/core/store/index.ts';
import { EmbedControls } from './index.tsx';

test('failed attachment saves retry the exact request once and effect replay performs no action', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const retry = vi.fn(async () => undefined);
  const add = vi.fn(async () => {
    throw new SaveError(new Error('Offline save'), retry);
  });
  const remove = vi.fn(async () => undefined);
  const root = createRoot(document.body);
  const target = {
    format: 'vaulter-eav-snapshot-v1' as const,
    scope: 'test',
    journal: 'test',
    transaction: 'accepted',
    entity: 'record',
    type: 'tasks.task',
  };
  try {
    await act(() =>
      root.render(
        <StrictMode>
          <EmbedControls
            choices={[{ key: 'task', label: 'Task', target }]}
            placements={[]}
            add={add}
            remove={remove}
          />
        </StrictMode>,
      ),
    );
    expect(add).not.toHaveBeenCalled();
    const select = document.querySelector('select')!;
    await act(() => {
      select.value = 'task';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Embed record')!
        .click();
    });
    expect(add).toHaveBeenCalledWith({ mode: 'live', target });
    expect(select.disabled).toBe(true);
    await act(async () => {
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent === 'Retry embed save')!
        .click();
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Embedded records saved.');
  } finally {
    await act(() => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { Form, PromptSuggestions } from './index.ts';

test('suggestions select caller-owned values without submitting and respect disabled state', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.body);
  const onSelect = vi.fn();
  const onSubmit = vi.fn();
  const suggestions = [
    { value: 'first', label: 'Start here' },
    { value: 'second', label: 'Start here' },
  ];
  const render = (selected?: string, disabled = false) =>
    act(() =>
      root.render(
        <Form layout="inline" onSubmit={onSubmit}>
          <PromptSuggestions
            label="Suggested answers"
            suggestions={suggestions}
            selected={selected}
            disabled={disabled}
            onSelect={onSelect}
          />
        </Form>,
      ),
    );
  try {
    await render('');
    expect(document.querySelector('section')?.getAttribute('aria-label')).toBe('Suggested answers');
    const buttons = () => [...document.querySelectorAll('button')];
    expect(buttons().every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true);
    await act(async () => buttons()[1]!.click());
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('second');
    expect(onSubmit).not.toHaveBeenCalled();
    await render('second');
    expect(buttons().map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
    ]);
    await render('second', true);
    expect(buttons().every((button) => button.disabled)).toBe(true);
    await act(async () => buttons()[0]!.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    await render();
    expect(buttons().every((button) => !button.hasAttribute('aria-pressed'))).toBe(true);
    await act(async () => root.render(<PromptSuggestions suggestions={[]} onSelect={onSelect} />));
    expect(document.body.textContent).toBe('');
    expect(document.querySelector('section')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

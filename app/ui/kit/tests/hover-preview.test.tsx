// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { HoverPreview, PresentationPreview } from '../index.ts';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
it('resolves eligible links after a hover delay and dismisses on leaving, scrolling and disposal', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const resolve = vi.fn((href: string) =>
    href === '#/note'
      ? { title: 'A retained note', text: 'Its actual supplied excerpt' }
      : undefined,
  );
  act(() => root.render(<HoverPreview resolve={resolve} selector="a.example" />));
  const link = document.createElement('a');
  link.className = 'example';
  link.href = '#/note';
  document.body.append(link);
  act(() => {
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(249);
  });
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(host.textContent).toContain('A retained note');
  expect(resolve).toHaveBeenCalledWith('#/note');
  act(() => window.dispatchEvent(new Event('scroll')));
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  act(() => {
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    link.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    vi.advanceTimersByTime(250);
  });
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  act(() => {
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    root.unmount();
    vi.advanceTimersByTime(250);
  });
  expect(resolve).toHaveBeenCalledTimes(1);
  vi.unstubAllGlobals();
});

it('drops resolved content when its owning resolver changes', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const first = () => ({ title: 'Old content' });
  act(() => root.render(<HoverPreview resolve={first} selector="a.example" />));
  const link = document.createElement('a');
  link.className = 'example';
  document.body.append(link);
  act(() => {
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(250);
  });
  expect(host.textContent).toContain('Old content');
  act(() => root.render(<HoverPreview resolve={() => undefined} selector="a.example" />));
  expect(host.querySelector('[role="tooltip"]')).toBeNull();
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it('bounded desktop hover uses its own pointer policy and ignores neighboring specimen links', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const resolve = vi.fn(() => ({ title: 'Desktop specimen' }));
  act(() =>
    root.render(
      <>
        <PresentationPreview device="desktop" height={400}>
          <HoverPreview resolve={resolve} selector="a.example" />
          <a className="example" href="#/owned">
            Own link
          </a>
        </PresentationPreview>
        <PresentationPreview device="mobile" height={400}>
          <a className="example" href="#/other">
            Neighbor link
          </a>
        </PresentationPreview>
      </>,
    ),
  );
  const links = host.querySelectorAll('a');
  act(() => {
    links[1]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(250);
  });
  expect(resolve).not.toHaveBeenCalled();
  act(() => {
    links[0]!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(250);
  });
  expect(resolve).toHaveBeenCalledWith('#/owned');
  expect(host.querySelector('[data-kit-preview="desktop"] [role="tooltip"]')?.textContent).toBe(
    'Desktop specimen',
  );
  expect(host.querySelector('[data-kit-preview="mobile"] [role="tooltip"]')).toBeNull();
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

it('neighboring mouseout events do not dismiss the owned bounded hover', () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const resolve = () => ({ title: 'Owned hover' });
  act(() =>
    root.render(
      <PresentationPreview device="desktop" height={300}>
        <HoverPreview resolve={resolve} selector="a.example" />
        <a className="example" href="#/owned">
          Own
        </a>
      </PresentationPreview>,
    ),
  );
  const own = host.querySelector('a')!;
  const neighbor = document.createElement('a');
  neighbor.className = 'example';
  document.body.append(neighbor);
  act(() => {
    own.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    vi.advanceTimersByTime(250);
  });
  expect(host.querySelector('[role="tooltip"]')).not.toBeNull();
  act(() => neighbor.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
  expect(host.querySelector('[role="tooltip"]')).not.toBeNull();
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

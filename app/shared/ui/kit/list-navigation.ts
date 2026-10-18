/** The visible rows of the list being moved through, in page order. */
const rows = () =>
  [...document.querySelectorAll<HTMLElement>('[data-nav]')].filter(
    (el) => el.offsetParent !== null && !el.closest('[inert], [aria-hidden="true"]'),
  );

function move(by: 1 | -1) {
  const all = rows();
  if (!all.length) return;
  const at = all.indexOf(document.activeElement as HTMLElement);
  const next =
    all[at < 0 ? (by > 0 ? 0 : all.length - 1) : Math.min(all.length - 1, Math.max(0, at + by))];
  next.focus({ preventScroll: true });
  next.scrollIntoView({ block: 'nearest' });
}

/** Shared list focus and scrolling, called before application command dispatch. */
export function navigateList(event: KeyboardEvent): boolean {
  const target = event.target;
  const typing =
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      // biome-ignore lint/security/noSecrets: a CSS selector, not a secret
      !!target.closest('input, textarea, select, [contenteditable="true"]'));
  if (
    event.defaultPrevented ||
    event.isComposing ||
    typing ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey
  )
    return false;
  const active = document.activeElement;
  const onRow = active instanceof HTMLElement && active.hasAttribute('data-nav');
  if (event.key === 'j' || (onRow && event.key === 'ArrowDown')) {
    event.preventDefault();
    move(1);
    return true;
  }
  if (event.key === 'k' || (onRow && event.key === 'ArrowUp')) {
    event.preventDefault();
    move(-1);
    return true;
  }
  if (onRow && event.key === 'Escape') {
    active.blur();
    return true;
  }
  return false;
}

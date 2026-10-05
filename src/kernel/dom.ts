// The kernel's own screens (safe mode, the standby tab) in plain DOM: an element with its attributes
// (true for one without a value, false or missing for none) and children.
type Child = Node | string | null | undefined | false;

export function h(tag: string, attrs: Record<string, string | boolean> = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs))
    if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  el.append(...children.filter((c): c is Node | string => !!c));
  return el;
}

/** Where the kernel's screens go. */
export const root = () => document.getElementById('vaulter') ?? document.body;

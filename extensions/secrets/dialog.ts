// The password prompt for the page's sealed secrets, when this device
// hasn't opened them yet. "Not now" closes it until the next start.

/** An element with its style and properties, and its children. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { style?: string; [property: string]: unknown } = {},
  ...children: (Node | string)[]
) {
  const { style, ...rest } = props;
  const element: HTMLElementTagNameMap[K] = Object.assign(
    document.createElement(tag),
    rest,
  );
  if (style) {
    element.style.cssText = style;
  }
  element.append(...children);
  return element;
}

/** Shows the prompt, over whatever the page shows. */
export function unlockDialog(unlock: (password: string) => Promise<void>) {
  const input = el('input', {
    type: 'password',
    name: 'password',
    autocomplete: 'current-password',
    required: true,
    style: 'font:inherit;padding:.4rem .6rem',
  });
  const alert = el('p', { role: 'alert', style: 'color:#c33;margin:0' });
  const later = el('button', { type: 'button' }, 'Not now');
  const form = el(
    'form',
    { method: 'dialog', style: 'display:grid;gap:.75rem' },
    el('h1', { style: 'margin:0;font-size:1.3rem' }, 'Vaulter'),
    el(
      'label',
      { style: 'display:grid;gap:.25rem' },
      'This device needs the password for its secrets',
      input,
    ),
    alert,
    el(
      'div',
      { style: 'display:flex;gap:.5rem' },
      el('button', {}, 'Unlock'),
      later,
    ),
  );
  const dialog = el(
    'dialog',
    { style: 'max-width:22rem;font:15px/1.5 system-ui,sans-serif' },
    form,
  );
  later.onclick = () => dialog.close();
  form.onsubmit = (event) => {
    event.preventDefault();
    alert.textContent = 'Opening…';
    unlock(input.value).then(
      () => dialog.close(),
      (error: Error) => {
        alert.textContent = error.message;
        input.select();
      },
    );
  };
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

// The password prompt for the page's sealed secrets, over whatever the page shows (safe mode too), when
// this device hasn't opened the sealed file yet. "Not now" closes it; it asks again on the next start.
import type { Unsealer } from './unseal.ts';

export function unlockDialog(u: Unsealer) {
  const dialog = document.createElement('dialog');
  dialog.style.cssText = 'max-width:22rem;font:15px/1.5 system-ui,sans-serif';
  dialog.innerHTML = `
    <form method="dialog" style="display:grid;gap:.75rem">
      <h1 style="margin:0;font-size:1.3rem">Vaulter</h1>
      <label style="display:grid;gap:.25rem">This device needs the password for its secrets
        <input type="password" name="password" autocomplete="current-password" required style="font:inherit;padding:.4rem .6rem" />
      </label>
      <p role="alert" style="color:#c33;margin:0"></p>
      <div style="display:flex;gap:.5rem"><button value="unlock">Unlock</button><button type="button" name="later">Not now</button></div>
    </form>`;
  const form = dialog.querySelector('form')!;
  const input = dialog.querySelector('input')!;
  const alert = dialog.querySelector('[role=alert]')!;
  dialog.querySelector<HTMLButtonElement>('[name=later]')!.onclick = () => dialog.close();
  form.onsubmit = (e) => {
    e.preventDefault();
    alert.textContent = 'Opening…';
    u.unlock(input.value).then(
      () => dialog.close(),
      (err: Error) => {
        alert.textContent = err.message;
        input.select();
      },
    );
  };
  dialog.onclose = () => dialog.remove();
  document.body.append(dialog);
  dialog.showModal();
}

// The password prompt for sealed secrets: a bare screen, part of the kernel like safe mode, shown before
// any extension starts when this device hasn't opened the page's sealed file yet. "Not now" starts
// without them (and asks again next time).
import type { Unsealer } from './unseal.ts';

export function unlockScreen(u: Unsealer): Promise<void> {
  return new Promise((done) => {
    const root = document.getElementById('pip') ?? document.body;
    const form = document.createElement('form');
    form.style.cssText =
      'max-width:22rem;margin:20vh auto;display:grid;gap:.75rem;font:15px/1.5 system-ui,sans-serif';
    form.innerHTML = `
      <h1 style="margin:0;font-size:1.3rem">Vaulter</h1>
      <label style="display:grid;gap:.25rem">This device needs the password for its secrets
        <input type="password" name="password" autocomplete="current-password" required style="font:inherit;padding:.4rem .6rem" />
      </label>
      <p role="alert" style="color:#c33;margin:0"></p>
      <div style="display:flex;gap:.5rem"><button type="submit">Unlock</button><button type="button" name="later">Not now</button></div>`;
    const input = form.querySelector('input')!;
    const alert = form.querySelector('[role=alert]')!;
    form.querySelector<HTMLButtonElement>('[name=later]')!.onclick = () => done();
    form.onsubmit = (e) => {
      e.preventDefault();
      alert.textContent = 'Opening…';
      u.unlock(input.value).then(
        () => done(),
        (err: Error) => {
          alert.textContent = err.message;
          input.select();
        },
      );
    };
    root.replaceChildren(form);
    input.focus();
  });
}

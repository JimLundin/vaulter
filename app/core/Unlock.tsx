// The password, once per device per 30 days (unlock.ts).
import { type SubmitEvent, useId, useState } from 'react';

export function Unlock({ unlock }: { unlock: (password: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setWrong(false);
    try {
      await unlock(pw);
    } catch {
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <form className="unlock" onSubmit={submit}>
      <h1>Vault</h1>
      <label htmlFor={id}>Password</label>
      <input
        id={id}
        type="password"
        autoComplete="current-password"
        // biome-ignore lint/a11y/noAutofocus: the password is the screen's only input, and what it's for
        autoFocus={true}
        value={pw}
        disabled={busy}
        onChange={(e) => setPw(e.currentTarget.value)}
      />
      <button type="submit" disabled={busy || !pw}>
        {busy ? 'Opening…' : 'Open'}
      </button>
      {wrong ? <p className="app-error">That isn't the password.</p> : null}
      <p className="lede">This device remembers it for 30 days.</p>
    </form>
  );
}

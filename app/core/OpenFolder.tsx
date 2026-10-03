// The vault folder on this device (backends/folder.ts): picked once, reopened with a click.
import { useState } from 'react';

export function OpenFolder({
  saved,
  open,
}: {
  saved: string | null;
  open: (pick: boolean) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const go = (pick: boolean) =>
    open(pick).catch((e) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
  return (
    <div className="unlock">
      <h1>Vault</h1>
      {!!saved && (
        <button type="button" onClick={() => go(false)}>
          Reopen {saved}
        </button>
      )}
      <button type="button" className={saved ? 'quiet' : ''} onClick={() => go(!!saved)}>
        {saved ? 'Open another folder' : 'Open the vault folder'}
      </button>
      {!!error && <p className="app-error">{error}</p>}
      <p className="lede">
        The vault's root on this device: notes are read and written there. Chromium browsers only.
      </p>
    </div>
  );
}

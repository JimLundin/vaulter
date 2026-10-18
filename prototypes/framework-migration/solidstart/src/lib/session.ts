import { createContext, createSignal, useContext } from 'solid-js';
import { createPrototypeVault, emptyReading, type PrototypeVault } from '@prototype/vault.ts';
export function createSession() {
  const [vault, setVault] = createSignal<PrototypeVault>();
  const [reading, setReading] = createSignal(emptyReading);
  const [chat, setChat] = createSignal<ReturnType<PrototypeVault['conversation']['snapshot']>>();
  const [error, setError] = createSignal('');
  let generation = 0;
  let active = true;
  let unsubscribers: (() => void)[] = [];
  async function reload() {
    const current = vault();
    if (!current) return;
    const request = ++generation;
    const next = await current.read();
    if (active && request === generation) setReading(next);
  }
  return {
    vault, reading, chat, error,
    async start() {
      try {
        const opened = await createPrototypeVault();
        if (!active) { opened.dispose(); return; }
        setVault(opened); setChat(opened.conversation.snapshot());
        unsubscribers = [opened.db.subscribe(() => void reload()), opened.conversation.subscribe(() => setChat(opened.conversation.snapshot()))];
        await reload();
      } catch (cause) { setError(String(cause)); }
    },
    dispose() { active = false; generation++; unsubscribers.forEach((stop) => stop()); vault()?.dispose(); },
  };
}
export type Session = ReturnType<typeof createSession>;
export const VaultContext = createContext<Session>();
export const useVault = () => useContext(VaultContext)!;

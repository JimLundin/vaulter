import { createPrototypeVault, emptyReading, type PrototypeVault } from '@prototype/vault.ts';
export function createSession() {
  let vault = $state.raw<PrototypeVault>();
  let reading = $state.raw(emptyReading);
  let chat = $state.raw<ReturnType<PrototypeVault['conversation']['snapshot']>>();
  let error = $state('');
  let generation = 0;
  let active = true;
  let unsubscribers: (() => void)[] = [];
  async function reload() {
    if (!vault) return;
    const request = ++generation;
    const next = await vault.read();
    if (active && request === generation) reading = next;
  }
  return {
    get vault() { return vault; }, get reading() { return reading; },
    get chat() { return chat; }, get error() { return error; },
    async start() {
      try {
        const opened = await createPrototypeVault();
        if (!active) { opened.dispose(); return; }
        vault = opened;
        chat = opened.conversation.snapshot();
        unsubscribers = [opened.db.subscribe(() => void reload()), opened.conversation.subscribe(() => { chat = opened.conversation.snapshot(); })];
        await reload();
      } catch (cause) { error = String(cause); }
    },
    dispose() { active = false; generation++; unsubscribers.forEach((stop) => stop()); vault?.dispose(); },
  };
}
export type Session = ReturnType<typeof createSession>;

// The kernel: imports the extensions this device has on, and keeps what came of each (ARCHITECTURE.md,
// "The kernel"). Extensions reach each other by importing one another (#extensions/<id>), so the module
// graph is the wiring and the start order: the kernel only chooses which folders to import. An
// extension that one that is on imports loads with it, on or not.
import { record } from './errors.ts';

/** An extension's own description, in its about.ts: read before any of its code runs. */
export interface About {
  version: string;
  /** When Vaulter should use it; one line at most is always in Vaulter's context. */
  agentGuide?: string;
  /** On main but off until a device turns it on. */
  preview?: boolean;
  /** Hosts it fetches without a secret (net). */
  network?: string[];
  /** Its secrets, and the only hosts each is attached for (net). */
  secrets?: Record<string, { label: string; hosts: string[] }>;
}

export interface ExtensionInfo {
  id: string;
  about: About;
  status: 'running' | 'off' | 'failed';
  /** Why it failed to start. */
  problem?: string;
}

/** What an extension's index.ts exports. A provider of something kept per extension exports
 * `forget(id)`, called when that extension is removed. */
export type Exports = Record<string, unknown>;

/** This device's choices: extensions turned on or off, against each one's default (on, unless a
 * preview). */
export interface Settings {
  enabled: Record<string, boolean>;
}

export interface Device {
  /** This device's settings, kept between starts. */
  settings: { get: () => Settings; set: (s: Settings) => void };
  /** Starts the app again, so a change takes effect. */
  reload: () => void;
}

export interface Folders {
  about: Record<string, About>;
  /** Imports an extension's index.ts. */
  load: Record<string, () => Promise<Exports>>;
}

interface Entry extends ExtensionInfo {
  exports?: Exports;
}

let device: Device | undefined;
const entries = new Map<string, Entry>();
let done: () => void = () => undefined;

/** Resolves once every extension that is on has started, or failed to. */
export const started = new Promise<void>((ok) => {
  done = ok;
});

/** Imports every extension this device has on, side by side; one that fails is kept with why. */
export async function boot(folders: Folders, on: Device) {
  device = on;
  const { enabled } = on.settings.get();
  await Promise.all(
    Object.entries(folders.about).map(async ([id, about]) => {
      const entry: Entry = { id, about, status: 'off' };
      entries.set(id, entry);
      if (!(enabled[id] ?? !about.preview)) return;
      try {
        entry.exports = await folders.load[id]();
        entry.status = 'running';
      } catch (e) {
        entry.status = 'failed';
        entry.problem = (e as Error).message;
        record(id, 'start', e);
      }
    }),
  );
  done();
}

/** Every extension in the page, in id order. */
export const extensions = (): ExtensionInfo[] =>
  [...entries.values()]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ exports: _, ...info }) => info);

/** The running extensions' exports: tools for Vaulter, a shell, `forget`. */
export const running = () =>
  [...entries.values()]
    .filter((e) => e.status === 'running')
    .map((e) => ({ id: e.id, about: e.about, exports: e.exports ?? {} }));

const need = () => {
  if (!device) throw new Error('the kernel has not started');
  return device;
};

/** Turns an extension on or off for this device, and starts the app again. */
export function setEnabled(id: string, on: boolean) {
  const d = need();
  const { enabled } = d.settings.get();
  d.settings.set({ enabled: { ...enabled, [id]: on } });
  d.reload();
}

/** Drops what every provider keeps for `id` (its records, its secrets, its questions), and turns it
 * off. */
export async function remove(id: string) {
  for (const r of running()) {
    const forget = r.exports.forget as ((id: string) => Promise<void>) | undefined;
    await forget?.(id);
  }
  setEnabled(id, false);
}

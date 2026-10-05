// The kernel: imports the extensions this device has on, and keeps what came of each (ARCHITECTURE.md,
// "The kernel"). Extensions reach each other by importing one another (#extensions/<id>), so the module
// graph is the wiring and the start order: the kernel only chooses which folders to import. An
// extension that one that is on imports loads with it, on or not.

/** An extension's own description, in its about.ts: read before any of its code runs. */
export interface About {
  version: string;
  /** When Vaulter should use it; one line at most is always in Vaulter's context. */
  agentGuide?: string;
  /** On main but off until a device turns it on. */
  preview?: boolean;
  /** Its secrets, and the only hosts each is attached for (the secrets extension). */
  secrets?: Record<string, { label: string; hosts: string[] }>;
}

export interface ExtensionInfo {
  id: string;
  about: About;
  status: 'running' | 'off' | 'failed';
  /** Why it failed to start. */
  problem?: string;
}

/** What an extension's index.ts exports. */
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

/** The running extensions' exports: tools for Vaulter, a shell. */
export const running = () =>
  [...entries.values()]
    .filter((e) => e.status === 'running')
    .map((e) => ({ id: e.id, about: e.about, exports: e.exports ?? {} }));

/** Turns an extension on or off for this device, and starts the app again. */
export function setEnabled(id: string, on: boolean) {
  if (!device) throw new Error('the kernel has not started');
  const { enabled } = device.settings.get();
  device.settings.set({ enabled: { ...enabled, [id]: on } });
  device.reload();
}

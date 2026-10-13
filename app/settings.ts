/** Modules own definitions and interpretation; storage and presentation use this shared interface. */
export interface SettingDefinition {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly kind?: 'text' | 'number' | 'multiline' | 'secret' | 'readonly';
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly clearable?: boolean;
  readonly parse?: (value: string) => unknown;
}

export interface SettingsDefinition {
  readonly id: string;
  readonly name: string;
  readonly fields: readonly SettingDefinition[];
}

export interface SettingsStore {
  readonly snapshot: () => Readonly<Record<string, string>>;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: (key: string, value: string) => void;
  readonly reset: () => void;
  readonly values: () => Readonly<Record<string, unknown>>;
}

export function deviceSettingsStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    // Browser privacy settings can reject access to storage before any read is attempted.
  }
}

/** Secret fields use the session credential store, never this preference store. */
export function createSettings(
  definition: SettingsDefinition,
  options: {
    storage?: Storage;
    storageKey?: string;
    initial?: Readonly<Record<string, string>>;
  } = {},
): SettingsStore {
  const storage = options.storage ?? deviceSettingsStorage();
  const storageKey = options.storageKey ?? `vaulter.settings.${definition.id}`;
  const fields = definition.fields.filter((field) => field.kind !== 'secret');
  const editable = fields.filter((field) => field.kind !== 'readonly');
  const defaults = Object.fromEntries(fields.map((field) => [field.key, field.defaultValue ?? '']));
  const listeners = new Set<() => void>();
  let storedRaw: string | null | undefined;
  let hasRead = false;
  const read = (
    initial?: Readonly<Record<string, string>>,
    fallback: Readonly<Record<string, string>> = defaults,
  ) => {
    const values = { ...defaults };
    try {
      const raw = storage?.getItem(storageKey);
      if (hasRead && raw === storedRaw && initial === undefined) return fallback;
      storedRaw = raw;
      hasRead = true;
      const stored: unknown = raw ? JSON.parse(raw) : initial;
      if (stored && typeof stored === 'object') {
        for (const field of editable) {
          const value: unknown = Reflect.get(stored, field.key);
          if (typeof value !== 'string') continue;
          try {
            field.parse?.(value);
            values[field.key] = value;
          } catch {
            // A malformed preference cannot prevent the other settings or the app from opening.
          }
        }
      }
    } catch {
      // Preferences still work for this session when browser storage cannot be read.
      return Object.freeze({ ...fallback });
    }
    return Object.freeze(values);
  };
  let current = read(options.initial);
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const refresh = () => {
    if (!storage) return;
    const next = read(undefined, current);
    if (fields.every((field) => next[field.key] === current[field.key])) return;
    current = next;
    notify();
  };
  const changedElsewhere = (event: StorageEvent) => {
    if (event.storageArea !== storage || (event.key !== storageKey && event.key !== null)) return;
    refresh();
  };
  return {
    snapshot: () => current,
    subscribe(listener) {
      const first = !listeners.size;
      if (first) globalThis.addEventListener?.('storage', changedElsewhere);
      listeners.add(listener);
      if (first) refresh();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) globalThis.removeEventListener?.('storage', changedElsewhere);
      };
    },
    set(key, value) {
      const field = editable.find((candidate) => candidate.key === key);
      if (!field) throw new Error('This setting cannot be changed as a device preference.');
      field.parse?.(value);
      const next = { ...current, [key]: value };
      const overrides = Object.fromEntries(
        editable
          .filter((candidate) => next[candidate.key] !== defaults[candidate.key])
          .map((candidate) => [candidate.key, next[candidate.key]]),
      );
      const serialized = JSON.stringify(overrides);
      storage?.setItem(storageKey, serialized);
      storedRaw = serialized;
      current = Object.freeze(next);
      notify();
    },
    reset() {
      storage?.removeItem(storageKey);
      storedRaw = null;
      current = Object.freeze({ ...defaults });
      notify();
    },
    values: () =>
      Object.freeze(
        Object.fromEntries(
          fields.map((field) => [
            field.key,
            field.parse ? field.parse(current[field.key] ?? '') : current[field.key],
          ]),
        ),
      ),
  };
}

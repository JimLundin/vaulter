// @vitest-environment happy-dom
import { afterEach, expect, test, vi } from 'vitest';
import { createSettings, type SettingsDefinition } from './store.ts';

const definition: SettingsDefinition = {
  id: 'fixture',
  name: 'Fixture',
  fields: [
    { key: 'text', label: 'Text', description: 'Text preference.', defaultValue: 'default' },
    {
      key: 'limit',
      label: 'Limit',
      description: 'Positive whole number.',
      defaultValue: '3',
      parse: (value) => {
        const number = Number(value);
        if (!Number.isSafeInteger(number) || number < 1) throw new Error('Invalid limit');
        return number;
      },
    },
    { key: 'key', label: 'Key', description: 'Credential.', kind: 'secret' },
    {
      key: 'endpoint',
      label: 'Endpoint',
      description: 'Installed endpoint.',
      kind: 'readonly',
      defaultValue: 'https://installed.example',
    },
  ],
};
const storageKey = 'vaulter.settings.fixture';
const subscriptions: (() => void)[] = [];

afterEach(() => {
  for (const unsubscribe of subscriptions.splice(0)) unsubscribe();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

test('settings persist editable overrides, parse values and reset only their own module', () => {
  localStorage.setItem('other', 'retained');
  const settings = createSettings(definition);
  const first = settings.snapshot();
  expect(settings.snapshot()).toBe(first);
  expect(Object.isFrozen(first)).toBe(true);
  expect(settings.values()).toEqual({
    text: 'default',
    limit: 3,
    endpoint: 'https://installed.example',
  });
  settings.set('text', 'custom');
  settings.set('limit', '7');
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ text: 'custom', limit: '7' });
  const reopened = createSettings(definition);
  expect(reopened.values()).toEqual({
    text: 'custom',
    limit: 7,
    endpoint: 'https://installed.example',
  });
  reopened.set('text', 'default');
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ limit: '7' });
  reopened.reset();
  expect(reopened.values()).toEqual({
    text: 'default',
    limit: 3,
    endpoint: 'https://installed.example',
  });
  expect(localStorage.getItem(storageKey)).toBeNull();
  expect(localStorage.getItem('other')).toBe('retained');
});

test('malformed fields do not hide valid preferences and stored secrets or installed values are ignored', () => {
  localStorage.setItem(
    storageKey,
    JSON.stringify({
      text: 'retained',
      limit: '0',
      key: 'secret',
      endpoint: 'https://untrusted.example',
      extra: 'ignored',
    }),
  );
  const settings = createSettings(definition);
  expect(settings.values()).toEqual({
    text: 'retained',
    limit: 3,
    endpoint: 'https://installed.example',
  });
  expect(() => settings.set('key', 'secret')).toThrow('cannot be changed');
  expect(() => settings.set('endpoint', 'https://other.example')).toThrow('cannot be changed');
  expect(() => settings.set('extra', 'value')).toThrow('cannot be changed');
  settings.set('limit', '5');
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ text: 'retained', limit: '5' });
});

test.each(['{', 'null', '[]', '"text"'])(
  'malformed module storage %s opens with defaults',
  (raw) => {
    localStorage.setItem(storageKey, raw);
    expect(createSettings(definition).values()).toEqual({
      text: 'default',
      limit: 3,
      endpoint: 'https://installed.example',
    });
  },
);

test('custom storage and initial values remain isolated from browser preferences', () => {
  localStorage.setItem(storageKey, JSON.stringify({ text: 'browser' }));
  const settings = createSettings(definition, {
    storage: sessionStorage,
    storageKey: 'custom',
    initial: { text: 'initial', limit: '9' },
  });
  subscriptions.push(settings.subscribe(vi.fn()));
  expect(settings.values()).toEqual({
    text: 'initial',
    limit: 9,
    endpoint: 'https://installed.example',
  });
  settings.set('text', 'session');
  expect(JSON.parse(sessionStorage.getItem('custom')!)).toEqual({ text: 'session', limit: '9' });
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ text: 'browser' });
});

test('failed writes and resets retain the accepted snapshot without notifying subscribers', () => {
  const settings = createSettings(definition);
  settings.set('text', 'accepted');
  const listener = vi.fn();
  subscriptions.push(settings.subscribe(listener));
  const before = settings.snapshot();
  expect(() => settings.set('limit', '0')).toThrow('Invalid limit');
  const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('Storage full');
  });
  expect(() => settings.set('text', 'unsaved')).toThrow('Storage full');
  write.mockRestore();
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
    throw new Error('Storage unavailable');
  });
  expect(() => settings.reset()).toThrow('Storage unavailable');
  expect(settings.snapshot()).toBe(before);
  expect(listener).not.toHaveBeenCalled();
});

test('browser storage events refresh matching module preferences and clear resets defaults', () => {
  const settings = createSettings(definition);
  const listener = vi.fn();
  subscriptions.push(settings.subscribe(listener));
  localStorage.setItem(storageKey, JSON.stringify({ text: 'external', limit: '8' }));
  globalThis.dispatchEvent(
    new StorageEvent('storage', { storageArea: sessionStorage, key: storageKey }),
  );
  globalThis.dispatchEvent(
    new StorageEvent('storage', { storageArea: localStorage, key: 'other' }),
  );
  expect(listener).not.toHaveBeenCalled();
  globalThis.dispatchEvent(
    new StorageEvent('storage', { storageArea: localStorage, key: storageKey }),
  );
  expect(settings.values()).toEqual({
    text: 'external',
    limit: 8,
    endpoint: 'https://installed.example',
  });
  expect(listener).toHaveBeenCalledOnce();
  localStorage.clear();
  globalThis.dispatchEvent(new StorageEvent('storage', { storageArea: localStorage, key: null }));
  expect(settings.snapshot().text).toBe('default');
  expect(listener).toHaveBeenCalledTimes(2);
});

test('unsubscribing removes storage listeners and subscribing later reads current preferences', () => {
  const settings = createSettings(definition);
  const listener = vi.fn();
  const unsubscribe = settings.subscribe(listener);
  unsubscribe();
  localStorage.setItem(storageKey, JSON.stringify({ text: 'changed while closed' }));
  globalThis.dispatchEvent(
    new StorageEvent('storage', { storageArea: localStorage, key: storageKey }),
  );
  expect(listener).not.toHaveBeenCalled();
  subscriptions.push(settings.subscribe(listener));
  expect(settings.snapshot().text).toBe('changed while closed');
});

test('saving a field preserves preferences saved by another store before storage events arrive', () => {
  const first = createSettings(definition);
  const second = createSettings(definition);
  first.set('text', 'saved elsewhere');
  expect(second.snapshot().text).toBe('default');

  second.set('limit', '8');

  expect(second.values()).toEqual({
    text: 'saved elsewhere',
    limit: 8,
    endpoint: 'https://installed.example',
  });
  expect(createSettings(definition).values()).toEqual(second.values());
  expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({
    text: 'saved elsewhere',
    limit: '8',
  });
});

test('blocked browser storage access still allows settings for the current session', () => {
  vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('Storage disabled', 'SecurityError');
  });
  const settings = createSettings(definition);
  settings.set('text', 'session only');
  expect(settings.snapshot().text).toBe('session only');
  settings.reset();
  expect(settings.snapshot().text).toBe('default');
});

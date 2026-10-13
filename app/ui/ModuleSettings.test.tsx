// @vitest-environment happy-dom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createSettings, type SettingsDefinition, type SettingsStore } from '../settings.ts';
import { ModuleSettings, SecretSettings } from './ModuleSettings.tsx';

const roots: Root[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

async function mount(content: ReactNode) {
  const root = createRoot(document.body);
  roots.push(root);
  await act(async () => root.render(content));
  return root;
}

function input(label: string) {
  const field = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!field) throw new Error(`Missing label ${label}`);
  const element = document.getElementById(field.htmlFor);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
    throw new Error(`Missing control for ${label}`);
  return element;
}

function button(label: string) {
  const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!element) throw new Error(`Missing button ${label}`);
  return element;
}

function dropdown(label: string) {
  const field = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  const element = field && document.getElementById(field.htmlFor);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`Missing dropdown for ${label}`);
  return element;
}

async function choose(label: string, optionLabel: string) {
  await act(() => {
    const select = dropdown(label);
    const option = [...select.options].find((candidate) => candidate.textContent === optionLabel);
    if (!option) throw new Error(`Missing ${optionLabel} option for ${label}`);
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(() => {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function descriptions(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

function memoryStore(definition: SettingsDefinition): SettingsStore {
  const defaults = Object.fromEntries(
    definition.fields
      .filter((field) => field.kind !== 'secret')
      .map((field) => [field.key, field.defaultValue ?? '']),
  );
  let state = defaults;
  const listeners = new Set<() => void>();
  const publish = () => {
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set: (key, value) => {
      const field = definition.fields.find((candidate) => candidate.key === key)!;
      if (field.kind === 'readonly') throw new Error('This setting is read only.');
      field.parse?.(value);
      state = { ...state, [key]: value.trim() || field.defaultValue || '' };
      publish();
    },
    reset: () => {
      state = defaults;
      publish();
    },
    values: () =>
      Object.fromEntries(
        definition.fields
          .filter((field) => field.kind !== 'secret')
          .map((field) => [field.key, field.parse?.(state[field.key] ?? '') ?? state[field.key]]),
      ),
  };
}

test('module fields update live, preserve input drafts and expose linked validation errors', async () => {
  const definition: SettingsDefinition = {
    id: 'provider',
    name: 'Provider',
    fields: [
      {
        key: 'model',
        label: 'Model',
        description: 'Used for new messages.',
        defaultValue: 'default-model',
      },
      {
        key: 'limit',
        label: 'Maximum steps',
        description: 'Maximum tool steps per message.',
        kind: 'number',
        defaultValue: '4',
        parse: (value) => {
          const parsed = Number(value);
          if (!Number.isInteger(parsed) || parsed < 1)
            throw new Error('Enter a positive whole number.');
          return parsed;
        },
      },
      {
        key: 'prompt',
        label: 'Instructions',
        description: 'Instructions for new runs.',
        kind: 'multiline',
        defaultValue: 'Be helpful.',
      },
      {
        key: 'repo',
        label: 'Repository',
        description: 'Current repository.',
        kind: 'readonly',
        defaultValue: 'example/vault',
      },
      { key: 'key', label: 'Provider key', description: 'Credential.', kind: 'secret' },
    ],
  };
  const store = memoryStore(definition);
  await mount(<ModuleSettings definition={definition} store={store} />);
  expect(document.body.textContent).not.toContain('Provider key');
  expect(input('Repository').readOnly).toBe(true);
  expect(input('Maximum steps').getAttribute('inputmode')).toBe('decimal');
  await fill(input('Model'), ' custom-model ');
  expect(store.values().model).toBe('custom-model');
  expect(input('Model').value).toBe(' custom-model ');
  await fill(input('Model'), '');
  expect(input('Model').value).toBe('');
  expect(store.values().model).toBe('default-model');
  await fill(input('Maximum steps'), '0');
  expect(input('Maximum steps').value).toBe('0');
  expect(store.values().limit).toBe(4);
  expect(input('Maximum steps').getAttribute('aria-invalid')).toBe('true');
  expect(descriptions(input('Maximum steps'))).toContain('Maximum tool steps per message.');
  expect(descriptions(input('Maximum steps'))).toContain('Enter a positive whole number.');
  await fill(input('Maximum steps'), '7');
  expect(store.values().limit).toBe(7);
  expect(input('Maximum steps').hasAttribute('aria-invalid')).toBe(false);
  await fill(input('Instructions'), 'Use concise answers.\nShow sources.');
  expect(store.values().prompt).toBe('Use concise answers.\nShow sources.');
});

test('external updates and reset replace local drafts with current module values', async () => {
  const definition: SettingsDefinition = {
    id: 'limits',
    name: 'Limits',
    fields: [
      {
        key: 'limit',
        label: 'Limit',
        description: 'A positive limit.',
        defaultValue: '3',
        parse: (value) => {
          if (Number(value) < 1) throw new Error('Must be positive.');
          return Number(value);
        },
      },
    ],
  };
  const store = memoryStore(definition);
  await mount(<ModuleSettings definition={definition} store={store} />);
  await fill(input('Limit'), '0');
  await act(async () => store.set('limit', '8'));
  expect(input('Limit').value).toBe('8');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await fill(input('Limit'), '0');
  await act(async () => button('Reset Limits to defaults').click());
  expect(input('Limit').value).toBe('3');
  expect(store.values().limit).toBe(3);
  expect(document.querySelector('[role="alert"]')).toBeNull();
});

const modelChoices: SettingsDefinition = {
  id: 'model-choices',
  name: 'Provider',
  fields: [
    {
      key: 'model',
      label: 'Model',
      description: 'Used for new messages.',
      defaultValue: 'default-model',
      choices: [
        { value: 'default-model', label: 'Default model' },
        { value: 'other-model', label: 'Other model' },
      ],
      allowCustom: true,
      parse: (value) => value.trim() || 'default-model',
    },
  ],
};

test('dropdowns persist choices and custom models without clearing the active model for blank drafts', async () => {
  const store = createSettings(modelChoices, { storage: sessionStorage });
  const root = await mount(<ModuleSettings definition={modelChoices} store={store} />);
  expect(dropdown('Model').value).toBe('default-model');
  expect(descriptions(dropdown('Model'))).toContain('Used for new messages.');
  await choose('Model', 'Other model');
  expect(store.values().model).toBe('other-model');
  await choose('Model', 'Custom…');
  expect(input('Custom model').value).toBe('');
  expect(store.values().model).toBe('other-model');
  await fill(input('Custom model'), '  ');
  expect(store.values().model).toBe('other-model');
  await fill(input('Custom model'), 'private-model');
  expect(store.values().model).toBe('private-model');
  await fill(input('Custom model'), '');
  expect(store.values().model).toBe('private-model');
  await act(async () => root.render(null));
  const reopened = createSettings(modelChoices, { storage: sessionStorage });
  await act(async () => root.render(<ModuleSettings definition={modelChoices} store={reopened} />));
  expect(dropdown('Model').selectedOptions[0]?.textContent).toBe('Custom…');
  expect(input('Custom model').value).toBe('private-model');
  await choose('Model', 'Other model');
  expect(document.querySelectorAll('input')).toHaveLength(0);
  expect(reopened.values().model).toBe('other-model');
  await choose('Model', 'Custom…');
  await fill(input('Custom model'), 'next-model');
  await act(async () => button('Reset Provider to defaults').click());
  expect(dropdown('Model').value).toBe('default-model');
  expect(document.querySelectorAll('input')).toHaveLength(0);
});

test('choice save failures keep the active value and link errors to the relevant dropdown or custom input', async () => {
  const store = createSettings(modelChoices, { storage: sessionStorage });
  await mount(<ModuleSettings definition={modelChoices} store={store} />);
  const save = vi.spyOn(store, 'set').mockImplementation(() => {
    throw new Error('Settings could not be saved.');
  });
  await choose('Model', 'Other model');
  expect(store.values().model).toBe('default-model');
  expect(dropdown('Model').getAttribute('aria-invalid')).toBe('true');
  expect(descriptions(dropdown('Model'))).toContain('Settings could not be saved.');
  await choose('Model', 'Custom…');
  await fill(input('Custom model'), 'private-model');
  expect(store.values().model).toBe('default-model');
  expect(input('Custom model').getAttribute('aria-invalid')).toBe('true');
  expect(descriptions(input('Custom model'))).toContain('Settings could not be saved.');
  save.mockRestore();
  await fill(input('Custom model'), 'private-model-retry');
  expect(store.values().model).toBe('private-model-retry');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await act(async () => store.set('model', 'other-model'));
  expect(dropdown('Model').value).toBe('other-model');
  expect(document.querySelectorAll('input')).toHaveLength(0);
  await choose('Model', 'Custom…');
  await act(async () => store.set('model', 'default-model'));
  await act(async () => store.set('model', 'other-model'));
  expect(dropdown('Model').value).toBe('other-model');
  expect(document.querySelectorAll('input')).toHaveLength(0);
});

const secrets: SettingsDefinition = {
  id: 'credentials',
  name: 'Credentials',
  fields: [
    {
      key: 'provider',
      label: 'Provider API key',
      description: 'Used for requests.',
      kind: 'secret',
    },
    {
      key: 'github',
      label: 'GitHub token',
      description: 'Used for the vault.',
      kind: 'secret',
      clearable: false,
    },
  ],
};

test('credentials show only configuration status and save, restore or clear on explicit actions', async () => {
  const onChange = vi.fn<(key: string, value: string | null | undefined) => Promise<void>>();
  function Credentials() {
    const [configured, setConfigured] = useState({ provider: true, github: true });
    const [overridden, setOverridden] = useState({ provider: false, github: false });
    return (
      <SecretSettings
        definition={secrets}
        configured={configured}
        overridden={overridden}
        onChange={async (key, value) => {
          await onChange(key, value);
          setConfigured((current) => ({ ...current, [key]: value !== null }));
          setOverridden((current) => ({ ...current, [key]: value !== undefined }));
        }}
      />
    );
  }
  onChange.mockResolvedValue(undefined);
  await mount(<Credentials />);
  expect(input('Provider API key').value).toBe('');
  expect(input('Provider API key').getAttribute('type')).toBe('password');
  expect(input('Provider API key').getAttribute('placeholder')).toBe('Configured');
  expect(descriptions(input('Provider API key'))).toContain('Using login value');
  expect(document.querySelector('button[aria-label="Clear GitHub token"]')).toBeNull();
  expect(button('Save Provider API key').disabled).toBe(true);
  await fill(input('Provider API key'), 'replacement-key');
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => button('Save Provider API key').click());
  expect(onChange).toHaveBeenLastCalledWith('provider', 'replacement-key');
  expect(input('Provider API key').value).toBe('');
  expect(document.body.innerHTML).not.toContain('replacement-key');
  expect(descriptions(input('Provider API key'))).toContain('Saved');
  await act(async () => button('Restore login value for Provider API key').click());
  expect(onChange).toHaveBeenLastCalledWith('provider', undefined);
  expect(descriptions(input('Provider API key'))).toContain('Restored login value');
  await act(async () => button('Clear Provider API key').click());
  expect(onChange).toHaveBeenLastCalledWith('provider', null);
  expect(input('Provider API key').getAttribute('placeholder')).toBe('Not configured');
  expect(button('Clear Provider API key').disabled).toBe(true);
});

test('credential failures retain the draft for retry and unavailable settings explain the disabled controls', async () => {
  const onChange = vi.fn<(key: string, value: string | null | undefined) => Promise<void>>();
  onChange.mockRejectedValueOnce(new Error('Encrypted settings could not be saved.'));
  onChange.mockResolvedValue(undefined);
  const root = await mount(
    <SecretSettings
      definition={secrets}
      configured={{}}
      overridden={{}}
      onChange={onChange}
      persistent={false}
    />,
  );
  expect(document.body.textContent).toContain('Credential changes last for this session.');
  await fill(input('Provider API key'), 'retry-key');
  await act(async () => button('Save Provider API key').click());
  expect(input('Provider API key').value).toBe('retry-key');
  expect(input('Provider API key').getAttribute('aria-invalid')).toBe('true');
  expect(descriptions(input('Provider API key'))).toContain(
    'Encrypted settings could not be saved.',
  );
  await act(async () => button('Save Provider API key').click());
  expect(input('Provider API key').value).toBe('');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  await act(async () =>
    root.render(
      <SecretSettings
        definition={secrets}
        configured={{ provider: true }}
        overridden={{ provider: true }}
        onChange={onChange}
        disabledReason="Unlock your login to change credentials."
      />,
    ),
  );
  expect(input('Provider API key').disabled).toBe(true);
  expect(button('Restore login value for Provider API key').disabled).toBe(true);
  expect(button('Clear Provider API key').disabled).toBe(true);
  expect(descriptions(input('Provider API key'))).toContain(
    'Unlock your login to change credentials.',
  );
});

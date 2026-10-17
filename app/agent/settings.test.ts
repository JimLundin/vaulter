import { expect, test } from 'vitest';
import { createSettings } from '@/settings/store.ts';
import { agentSettingsSchema } from './schema.ts';
import { agentOptions, agentSettings } from './settings.ts';

function storage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    key: (index) => [...entries.keys()][index] ?? null,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => {
      entries.set(key, value);
    },
    removeItem: (key) => {
      entries.delete(key);
    },
  };
}

test('every validated invocation option is represented by the Agent settings module', () => {
  expect(agentSettings.fields.map(({ key }) => key).sort((a, b) => a.localeCompare(b))).toEqual(
    Object.keys(agentSettingsSchema.shape).sort((a, b) => a.localeCompare(b)),
  );
});

test('numeric preset choices are valid invocation options and retain model or provider defaults', () => {
  const preferences = createSettings(agentSettings, { storage: storage() });
  const presetFields = agentSettings.fields.filter((field) => field.choices);
  expect(presetFields.map((field) => field.key)).toEqual([
    'maxSteps',
    'maxOutputTokens',
    'maxRetries',
  ]);
  for (const field of presetFields) {
    expect(field.kind).toBe('number');
    expect(field.allowCustom).toBe(true);
    for (const choice of field.choices!) {
      preferences.set(field.key, choice.value);
      const options = agentOptions(preferences.values());
      if (choice.value === '') expect(options).not.toHaveProperty(field.key);
      else expect(options[field.key]).toBe(Number(choice.value));
    }
  }
  expect(presetFields.find((field) => field.key === 'maxOutputTokens')?.choices).toContainEqual({
    value: '',
    label: 'Model default',
  });
  expect(presetFields.find((field) => field.key === 'maxRetries')?.choices).toContainEqual({
    value: '',
    label: 'Provider default',
  });
});

test('numeric suggestions preserve custom limits through reopening, default selection and reset', () => {
  const persistence = storage();
  const preferences = createSettings(agentSettings, { storage: persistence });
  preferences.set('maxSteps', '13');
  preferences.set('maxOutputTokens', '1536');
  preferences.set('maxRetries', '7');
  const reopened = createSettings(agentSettings, { storage: persistence });
  expect(agentOptions(reopened.values())).toEqual({
    maxSteps: 13,
    maxOutputTokens: 1536,
    maxRetries: 7,
  });
  reopened.set('maxOutputTokens', '');
  reopened.set('maxRetries', '');
  expect(agentOptions(reopened.values())).toEqual({ maxSteps: 13 });
  expect(agentOptions(createSettings(agentSettings, { storage: persistence }).values())).toEqual({
    maxSteps: 13,
  });
  reopened.reset();
  expect(agentOptions(reopened.values())).toEqual({ maxSteps: 12 });
  expect(persistence.getItem('vaulter.settings.agent')).toBeNull();
});

test('Agent preferences preserve zero and negative settings, omit blanks and validate before saving', () => {
  const persistence = storage();
  const preferences = createSettings(agentSettings, { storage: persistence });
  expect(agentOptions(preferences.values())).toEqual({ maxSteps: 12 });
  preferences.set('temperature', '0');
  preferences.set('seed', '-4');
  preferences.set('topK', '0');
  preferences.set('presencePenalty', '-2');
  preferences.set('stopSequences', 'END\r\n\n DONE ');
  preferences.set('maxRetries', '0');
  const reopened = createSettings(agentSettings, { storage: persistence });
  expect(agentOptions(reopened.values())).toEqual({
    maxSteps: 12,
    temperature: 0,
    seed: -4,
    topK: 0,
    presencePenalty: -2,
    stopSequences: ['END', ' DONE '],
    maxRetries: 0,
  });
  const before = persistence.getItem('vaulter.settings.agent');
  expect(() => reopened.set('temperature', '3')).toThrow('temperature');
  expect(persistence.getItem('vaulter.settings.agent')).toBe(before);
  reopened.set('temperature', '');
  expect(agentOptions(reopened.values())).not.toHaveProperty('temperature');
});

test.each([
  ['maxSteps', '0'],
  ['maxSteps', '1.5'],
  ['maxOutputTokens', '-1'],
  ['temperature', '-0.1'],
  ['topP', '1.1'],
  ['topK', '-1'],
  ['presencePenalty', '-3'],
  ['frequencyPenalty', '3'],
  ['seed', '0.5'],
  ['maxRetries', '-1'],
  ['maxOutputTokens', 'Infinity'],
  ['maxRetries', 'NaN'],
])('rejects invalid %s preferences (%s)', (key, value) => {
  const preferences = createSettings(agentSettings, { storage: storage() });
  expect(() => preferences.set(key, value)).toThrow();
});

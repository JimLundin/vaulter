import {
  createSettings,
  type SettingDefinition,
  type SettingsDefinition,
} from '../settings/store.ts';
import type { JsonObject } from '../vault/nodes/model.ts';
import { agentSettingsSchema, parseAgentSettings } from './schema.ts';

type AgentSettingKey = keyof typeof agentSettingsSchema.shape;

function numberSetting(
  key: Exclude<AgentSettingKey, 'stopSequences'>,
  label: string,
  description: string,
  defaultValue?: string,
  choices?: SettingDefinition['choices'],
): SettingDefinition {
  return {
    key,
    label,
    description,
    kind: 'number',
    ...(defaultValue === undefined ? {} : { defaultValue }),
    ...(choices ? { choices, allowCustom: true } : {}),
    parse: (value) => {
      if (!value.trim()) return;
      const number = Number(value);
      const parsed = agentSettingsSchema.shape[key].safeParse(number);
      if (!parsed.success) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
      return parsed.data;
    },
  };
}

/** The Agent owns the invocation settings it validates, records and supplies to text models. */
export const agentSettings: SettingsDefinition = {
  id: 'agent',
  name: 'Agent',
  fields: [
    numberSetting(
      'maxSteps',
      'Maximum steps',
      'Maximum model steps for each new Agent run.',
      '12',
      [4, 8, 12, 20, 40].map((value) => ({ value: String(value), label: String(value) })),
    ),
    numberSetting(
      'maxOutputTokens',
      'Maximum output tokens',
      'A positive token limit, or choose Model default.',
      undefined,
      [
        { value: '', label: 'Model default' },
        ...[256, 512, 1024, 2048, 4096, 8192, 16_384].map((value) => ({
          value: String(value),
          label: String(value),
        })),
      ],
    ),
    numberSetting(
      'temperature',
      'Temperature',
      'Sampling temperature from 0 to 2. Leave blank for the model default.',
    ),
    numberSetting(
      'topP',
      'Top P',
      'Probability mass from 0 to 1. Leave blank for the model default.',
    ),
    numberSetting('topK', 'Top K', 'A nonnegative integer. Leave blank for the model default.'),
    numberSetting(
      'presencePenalty',
      'Presence penalty',
      'Penalty from -2 to 2. Leave blank for the model default.',
    ),
    numberSetting(
      'frequencyPenalty',
      'Frequency penalty',
      'Penalty from -2 to 2. Leave blank for the model default.',
    ),
    {
      key: 'stopSequences',
      label: 'Stop sequences',
      description: 'One sequence per line. Leave blank for none.',
      kind: 'multiline',
      parse: (value) =>
        value.trim() ? value.split(/\r?\n/).filter((line) => line.length > 0) : undefined,
    },
    numberSetting(
      'seed',
      'Seed',
      'An integer for repeatable sampling where the model supports it.',
    ),
    numberSetting(
      'maxRetries',
      'Maximum retries',
      'A nonnegative retry count, or choose Provider default.',
      undefined,
      [
        { value: '', label: 'Provider default' },
        ...[0, 1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: String(value) })),
      ],
    ),
  ],
};

export function agentOptions(values: Readonly<Record<string, unknown>>): JsonObject {
  return parseAgentSettings(
    Object.fromEntries(
      agentSettings.fields.flatMap(({ key }) =>
        values[key] === undefined || values[key] === '' ? [] : [[key, values[key]]],
      ),
    ),
  );
}

/** Execution and the Agent-owned settings view use the same preference lifetime. */
export const agentPreferences = createSettings(agentSettings);

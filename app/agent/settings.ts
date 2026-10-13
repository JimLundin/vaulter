import type { SettingDefinition, SettingsDefinition } from '../settings.ts';
import type { JsonObject } from '../vault/nodes/model.ts';
import { agentSettingsSchema, parseAgentSettings } from './schema.ts';

type AgentSettingKey = keyof typeof agentSettingsSchema.shape;

function numberSetting(
  key: Exclude<AgentSettingKey, 'stopSequences'>,
  label: string,
  description: string,
  defaultValue?: string,
): SettingDefinition {
  return {
    key,
    label,
    description,
    kind: 'number',
    ...(defaultValue === undefined ? {} : { defaultValue }),
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
    numberSetting('maxSteps', 'Maximum steps', 'Maximum model steps for each new Agent run.', '12'),
    numberSetting(
      'maxOutputTokens',
      'Maximum output tokens',
      'A positive token limit. Leave blank for the model default.',
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
      'A nonnegative retry count. Leave blank for the provider default.',
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

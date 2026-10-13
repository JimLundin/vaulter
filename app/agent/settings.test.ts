import { expect, test } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { createSettings } from '../settings.ts';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request } from '../vault/nodes/fixtures.test-support.ts';
import { createAgentBackend } from './runtime.ts';
import { prepareAgentRun, readAgentRun } from './store.ts';
import { agentSettings, agentOptions } from './settings.ts';
import { agentSettingsSchema } from './schema.ts';

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

test('configured Agent sampling is retained in the run and reaches the provider', async () => {
  const preferences = createSettings(agentSettings, { storage: storage() });
  for (const [key, value] of Object.entries({
    maxOutputTokens: '256',
    temperature: '0.5',
    topP: '0.9',
    topK: '10',
    presencePenalty: '-1',
    frequencyPenalty: '1',
    seed: '-42',
    stopSequences: 'END\nDONE',
    maxRetries: '0',
  }))
    preferences.set(key, value);
  const options = agentOptions(preferences.values());
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('actors', [create('user', { kind: 'actor' }), create('agent', { kind: 'agent' })]),
  );
  const prepared = await prepareAgentRun(nodes, {
    id: 'start',
    run: 'run',
    agent: 'agent',
    recordedBy: 'user',
    at: '2026-10-13T10:00:00Z',
    provider: 'fixture',
    model: 'fixture-model',
    settings: options,
    context: [
      {
        data: {
          kind: 'contextInput',
          role: 'user',
          position: 0,
          transformation: 'verbatim',
          content: 'Hello',
        },
      },
    ],
  });
  const languageModel = new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text' },
        { type: 'text-delta', id: 'text', delta: 'Hello' },
        { type: 'text-end', id: 'text' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: undefined },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
        },
      ]),
    }),
  });
  const backend = createAgentBackend({ nodes, model: async () => languageModel });
  expect((await backend.start(prepared).done).phase).toBe('complete');
  expect((await readAgentRun(nodes, 'run'))?.data.settings).toEqual(options);
  expect(languageModel.doStreamCalls[0]).toMatchObject({
    maxOutputTokens: 256,
    temperature: 0.5,
    topP: 0.9,
    topK: 10,
    presencePenalty: -1,
    frequencyPenalty: 1,
    seed: -42,
    stopSequences: ['END', 'DONE'],
  });
  backend.dispose();
});

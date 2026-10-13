import { expect, test } from 'vitest';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import { create, request } from '../vault/nodes/fixtures.test-support.ts';
import type { NodeVersion } from '../vault/nodes/model.ts';
import { agentSources } from './sources.ts';

test('Agent source reading retains supplied text and never turns tool output JSON into prose', async () => {
  const nodes = memoryNodeBackend();
  await nodes.commit(
    request('original', [
      create('user', { kind: 'actor' }),
      create('run', { kind: 'agentRun', output: { text: 'Hidden output.' } }),
      {
        ...create('input', { kind: 'contextInput', content: 'Supplied historical text.' }, 'run'),
        placement: { parent: 'run', order: 'a' },
      },
      create(
        'structured',
        { kind: 'contextInput', content: { text: 'Hidden object content.' } },
        'run',
      ),
      create(
        'tool',
        { kind: 'toolExecution', input: 'Tool arguments', output: { text: 'Hidden tool output.' } },
        'run',
      ),
      create('foreign', { kind: 'foreign', content: 'Unknown content.' }),
      create('system', { kind: 'contextInput', role: 'system', content: 'Private instructions.' }),
      create('tool-result', { kind: 'contextInput', role: 'tool', content: 'Tool output.' }),
    ]),
  );
  const view = await nodes.snapshot();
  const textOf = (node: NodeVersion): string => agentSources.text(node, { view, textOf }) ?? '';
  expect(textOf(view.get('run')!)).toBe('Supplied historical text.');
  expect(textOf(view.get('structured')!)).toBe('');
  expect(textOf(view.get('tool')!)).toBe('');
  expect(agentSources.exactText?.(view.get('input')!, view)).toBe('Supplied historical text.');
  for (const node of ['run', 'structured', 'tool', 'foreign', 'system', 'tool-result'])
    expect(agentSources.exactText?.(view.get(node)!, view)).toBeUndefined();
  expect(agentSources.describe(view.get('input')!, view)).toEqual({ title: '' });
  expect(agentSources.text(view.get('foreign')!, { view, textOf })).toBeUndefined();
  expect(agentSources.describe(view.get('foreign')!, view)).toBeUndefined();
  nodes.close();
});

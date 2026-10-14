// @vitest-environment happy-dom
import { transactionFixture } from '../../vault/transactions/fixtures.test-support.ts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';
import { Chat } from './Chat.tsx';

test('both visible Chat surfaces observe the same response-save progress', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('actors', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  let failed = true;
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const conversation = createNodeConversation({
    nodes: transactionFixture({
      ...nodes,
      commit: async (value) => {
        if (value.kind.action === 'completeResponse') {
          if (failed) throw new Error('Response unavailable');
          await waiting;
        }
        return nodes.commit(value);
      },
    }),
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    selectedModel: 'fictional',
    instructions: 'Record.',
    execution: async () => ({ status: 'complete', text: 'Retained answer.' }),
  });
  const root = createRoot(document.body);
  const recoveryButtons = () =>
    [...document.querySelectorAll('button')].filter((button) =>
      ['Retry save', 'Saving…'].includes(button.textContent ?? ''),
    );
  try {
    await act(async () => {
      const submitted = conversation.prepareSubmission({ text: 'Retain this' });
      if (submitted.status !== 'owned') throw new Error('Expected retained request');
      await submitted.done;
      root.render(
        <>
          <Chat conversation={conversation} arg={null} presentation={{ page: true }} />
          <Chat
            conversation={conversation}
            arg={null}
            presentation={{ open: true, onClose: () => undefined }}
          />
        </>,
      );
    });
    expect(recoveryButtons()).toHaveLength(2);
    failed = false;
    await act(async () => {
      recoveryButtons()[0]!.click();
    });
    expect(recoveryButtons().map((button) => button.disabled)).toEqual([true, true]);
    expect(recoveryButtons().map((button) => button.textContent)).toEqual(['Saving…', 'Saving…']);
    await act(async () => {
      release();
      await conversation.retrySave();
    });
    expect(recoveryButtons()).toHaveLength(0);
    expect(document.body.textContent).toContain('Retained answer.');
  } finally {
    release();
    await act(async () => root.unmount());
    conversation.dispose();
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

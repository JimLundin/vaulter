// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { memoryNodeBackend } from '../../vault/nodes/memory.ts';
import { create, request, seed } from '../../vault/nodes/fixtures.test-support.ts';
import { createNodeConversation } from './node-conversation.ts';
import { createTranscription } from './transcription.ts';
import { Chat } from './Chat.tsx';
import { ChatIndicator } from './index.tsx';

test('a reply finishing with the mounted pane closed remains unread until it reopens', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const nodes = memoryNodeBackend();
  await seed(nodes);
  await nodes.commit(request('agent', [create('agent', { kind: 'agent', name: 'Fictional' })]));
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const model = new MockLanguageModelV4({
    doStream: async () => {
      await waiting;
      return {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Retained reply.' },
          { type: 'text-end', id: 'text' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 2, text: 2, reasoning: 0 },
            },
          },
        ]),
      };
    },
  });
  const conversation = createNodeConversation({
    nodes,
    user: 'user',
    agent: 'agent',
    provider: 'fictional',
    model: async () => model,
    selectedModel: 'fictional',
    instructions: 'Record.',
  });
  const voice = createTranscription(null);
  const root = createRoot(document.body);
  const render = (open: boolean) =>
    root.render(
      <>
        <ChatIndicator conversation={conversation} />
        <Chat
          conversation={conversation}
          arg={null}
          voice={voice}
          presentation={{ open, onClose: () => undefined }}
        />
      </>,
    );
  try {
    await act(async () => render(true));
    let accepted!: Promise<void>;
    await act(async () => {
      accepted = conversation.send('A thought');
    });
    await act(async () => render(false));
    await act(async () => {
      release();
      await accepted;
    });
    expect(document.querySelector('[aria-label="The agent replied"]')).not.toBeNull();
    await act(async () => render(true));
    expect(document.querySelector('[aria-label="The agent replied"]')).toBeNull();
    expect(document.body.textContent).toContain('Retained reply.');
    expect(model.doStreamCalls).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    conversation.dispose();
    voice.dispose();
    nodes.close();
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

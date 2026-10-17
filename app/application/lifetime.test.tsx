// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { OpenApplication } from './index.tsx';
import { createMemoryStorage } from '@/vault/eav/index.ts';
import { applicationDatabase } from './composition.ts';

test.each([false, true])(
  'Application scopes consumed Ask to its session and accepts a fresh explicit Ask (StrictMode=%s)',
  async (strict) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    localStorage.clear();
    history.replaceState(null, '', '#/chat/');

    const first = createMemoryStorage();
    const next = createMemoryStorage();
    const model = new MockLanguageModelV4({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: 'Completed Ask.' },
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
    const root = createRoot(document.body);
    function Surface({ storage }: { storage: typeof first }) {
      return (
        <OpenApplication
          session={{
            ready: true,

            locked: null,
            signOut: null,
            secrets: null,
            preloadedSecrets: null,
            secretOverrides: {},
            updateSecret: async () => undefined,

            eav: storage,
            status: { kind: 'synced', at: 0 },
            refresh: async () => undefined,
          }}
          model={async () => model}
          preview={{
            defaultModel: 'fictional',
            suggestions: async () => [],
            transcription: async () => ({ close() {}, finish: async () => '' }),
          }}
        />
      );
    }
    const render = (storage: typeof first) => {
      const product = <Surface storage={storage} />;
      root.render(strict ? <StrictMode>{product}</StrictMode> : product);
    };
    const ask = async (text: string) => {
      await act(async () => {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
        );
      });
      const input = document.querySelector<HTMLInputElement>('input[role="combobox"]');
      expect(input).not.toBeNull();
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          text,
        );
        input!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const choice = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
        item.textContent?.includes(`Ask the agent: ${text}`),
      );
      expect(choice).toBeDefined();
      await act(async () => choice!.click());
      await act(async () => {
        await vi.waitFor(() => expect(document.body.textContent).toContain('Completed Ask.'));
      });
    };
    try {
      await act(async () => render(first));
      await ask('Ask from the first session');
      expect(model.doStreamCalls).toHaveLength(1);
      await act(async () => render(next));
      expect(document.querySelector('textarea')?.value).toBe('');
      expect(model.doStreamCalls).toHaveLength(1);
      expect(
        await (await applicationDatabase(next)).entities.exchanges.query({ select: {} }),
      ).toEqual([]);
      await ask('Fresh explicit Ask');
      expect(model.doStreamCalls).toHaveLength(2);
      expect(document.body.textContent).toContain('Fresh explicit Ask');
    } finally {
      await act(async () => root.unmount());
      document.body.replaceChildren();
      localStorage.clear();
      vi.unstubAllGlobals();
    }
  },
);

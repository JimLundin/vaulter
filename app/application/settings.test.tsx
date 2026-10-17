// @vitest-environment happy-dom
// biome-ignore lint/correctness/noUnresolvedImports: React 19 exposes StrictMode; TypeScript and runtime tests verify it.
import { act, StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';
import { OpenApplication } from './index.tsx';
import { Surface } from '@/ui/kit/index.ts';
import { createMemoryStorage, sameEntity, type MemoryStorage } from '@/vault/eav/index.ts';
import { applicationDatabase } from './composition.ts';
import type { Secrets } from '@/vault/session/sealed.ts';
import { media } from '@/agent/openai/media.test-support.ts';

type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
const cleanups: (() => Promise<void>)[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/settings/');
});

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
  document.body.replaceChildren();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

function answer(text: string): StreamResult {
  return {
    stream: convertArrayToReadableStream([
      { type: 'stream-start', warnings: [] },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: text },
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
  };
}

function field(label: string) {
  const direct = document.querySelector<HTMLTextAreaElement>(`textarea[aria-label="${label}"]`);
  if (direct) return direct;
  const caption = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  const control = caption ? document.getElementById(caption.htmlFor) : null;
  if (
    !(
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement ||
      control instanceof HTMLSelectElement
    )
  )
    throw new Error(`Missing field ${label}`);
  return control;
}

function textField(label: string) {
  const control = field(label);
  if (control instanceof HTMLSelectElement) throw new Error(`Expected text field ${label}`);
  return control;
}

function selectField(label: string) {
  const control = field(label);
  if (!(control instanceof HTMLSelectElement)) throw new Error(`Expected dropdown ${label}`);
  return control;
}

function button(label: string) {
  const control = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!control) throw new Error(`Missing button ${label}`);
  return control;
}

async function fill(label: string, value: string) {
  const control = textField(label);
  await act(() => {
    const prototype =
      control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(control, value);
    control.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function select(label: string, value: string) {
  const control = selectField(label);
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(
      control,
      value,
    );
    control.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

async function submit() {
  const { form } = field('Message');
  if (!form) throw new Error('Missing message form');
  await act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
}

async function openSettings() {
  await act(() => {
    history.replaceState(null, '', '#/settings/');
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await act(async () => vi.waitFor(() => field('Model')));
}

async function fixture({
  strict = false,
  preview = false,
  stream = async () => answer('Completed settings request.'),
  storage: initialStorage = createMemoryStorage(),
  identity = {},
  credentialPending = false,
  saveSecret = async () => undefined,
}: {
  strict?: boolean;
  preview?: boolean;
  stream?: () => Promise<StreamResult>;
  storage?: MemoryStorage;
  identity?: object;
  credentialPending?: boolean;
  saveSecret?: (key: keyof Secrets, value: string | null | undefined) => Promise<void>;
} = {}) {
  const model = new MockLanguageModelV4({ doStream: stream });
  const suppliedModel = vi.fn(async (_name: string) => model);
  const updateSecret = vi.fn(saveSecret);
  const preloadedSecrets = { github: 'login-github', openai: 'login-openai' };
  const root = createRoot(document.body);
  let configure!: (changes: {
    storage?: MemoryStorage;
    identity?: object;
    credentialPending?: boolean;
  }) => void;
  function Fixture() {
    const [secrets, setSecrets] = useState<Secrets>({
      ...preloadedSecrets,
      openai: 'custom-openai',
    });
    const [secretOverrides, setOverrides] = useState<Partial<Record<keyof Secrets, string | null>>>(
      {
        openai: 'custom-openai',
      },
    );
    const [configuration, setConfiguration] = useState({
      storage: initialStorage,
      identity,
      credentialPending,
    });
    configure = (changes) => {
      setConfiguration((current) => ({ ...current, ...changes }));
    };
    return (
      <Surface>
        <OpenApplication
          session={{
            ready: true,
            identity: configuration.identity,
            credentialPending: configuration.credentialPending,

            locked: null,
            signOut: null,
            secrets,
            preloadedSecrets,
            secretOverrides,
            updateSecret: async (key, value) => {
              configure({ credentialPending: true });
              try {
                await updateSecret(key, value);
                setOverrides((current) => {
                  const next = { ...current };
                  if (value === undefined) delete next[key];
                  else next[key] = value;
                  return next;
                });
                setSecrets((current) => {
                  const next = { ...current };
                  if (value === null) delete next[key];
                  else next[key] = value ?? preloadedSecrets[key];
                  return next;
                });
              } finally {
                configure({ credentialPending: false });
              }
            },

            eav: configuration.storage,
            status: { kind: 'synced', at: 0 },
            refresh: async () => undefined,
          }}
          model={suppliedModel}
          preview={
            preview
              ? {
                  defaultModel: 'fictional-model',
                  suggestions: async () => [],
                  transcription: async () => ({ close: () => undefined, finish: async () => '' }),
                }
              : undefined
          }
        />
      </Surface>
    );
  }
  cleanups.push(async () => {
    await act(() => root.unmount());
  });
  await act(() =>
    root.render(
      strict ? (
        <StrictMode>
          <Fixture />
        </StrictMode>
      ) : (
        <Fixture />
      ),
    ),
  );
  await act(() => {
    globalThis.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    if (field('Message').disabled) throw new Error('Message text box is still unavailable');
  });
  return {
    storage: initialStorage,
    model,
    suppliedModel,
    updateSecret,
    configure: async (changes: Parameters<typeof configure>[0]) => act(() => configure(changes)),
  };
}

async function runs(storage: MemoryStorage) {
  const db = await applicationDatabase(storage);
  return db.entities.agentRuns.query({ select: { requestedModel: true, settings: true } });
}

async function conversations(storage: MemoryStorage) {
  return (await applicationDatabase(storage)).entities.conversations.query({ select: {} });
}

test.each([false, true])(
  'settings update future runs and retain drafts (StrictMode=%s)',
  async (strict) => {
    localStorage.setItem('vaulter.settings.openai', JSON.stringify({ model: 'saved-model' }));
    const { model, suppliedModel, storage } = await fixture({ strict, preview: true });
    for (const name of ['Appearance', 'Chat', 'Agent', 'OpenAI', 'GitHub storage'])
      expect(document.querySelector(`section[aria-label="${name}"]`)).not.toBeNull();
    for (const label of [
      'Instructions',
      'Maximum steps',
      'Maximum output tokens',
      'Temperature',
      'Top P',
      'Top K',
      'Presence penalty',
      'Frequency penalty',
      'Stop sequences',
      'Seed',
      'Maximum retries',
      'Model',
      'Voice model',
      'Live transcription model',
      'File transcription model',
      'Voice',
    ])
      expect(field(label)).toBeDefined();
    for (const label of [
      'Maximum steps',
      'Maximum output tokens',
      'Maximum retries',
      'Model',
      'Voice model',
      'Live transcription model',
      'File transcription model',
      'Voice',
    ])
      expect(selectField(label)).toBeDefined();
    expect(selectField('Model').selectedOptions[0]?.textContent).toBe('Custom…');
    expect(textField('Custom model').value).toBe('saved-model');
    expect(textField('OpenAI API endpoint').readOnly).toBe(true);
    expect(textField('Vault repository').readOnly).toBe(true);
    expect(textField('GitHub API endpoint').readOnly).toBe(true);
    expect(field('OpenAI API key').disabled).toBe(true);
    expect(document.body.textContent).toContain('Credentials are supplied by the preview server.');
    await fill('Message', 'Keep this draft while changing preferences.');
    await fill('Custom model', 'configured-model');
    await fill('Instructions', 'Use the supplied evidence.\nKeep answers concise.');
    await fill('Temperature', '0.4');
    await select('Maximum steps', '20');
    await select('Maximum output tokens', '256');
    await select('Maximum retries', '3');
    expect(field('Message').value).toBe('Keep this draft while changing preferences.');
    expect(model.doStreamCalls).toHaveLength(0);
    await act(() => button('Close settings').click());
    expect(field('Message').value).toBe('Keep this draft while changing preferences.');
    await submit();
    await act(async () => vi.waitFor(() => expect(field('Message').disabled).toBe(false)));
    expect(model.doStreamCalls).toHaveLength(1);
    expect(suppliedModel).toHaveBeenLastCalledWith('configured-model');
    expect(model.doStreamCalls[0]).toMatchObject({ temperature: 0.4, maxOutputTokens: 256 });
    expect(model.doStreamCalls[0]?.prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: 'Use the supplied evidence.\nKeep answers concise.',
        }),
      ]),
    );
    const [firstRun] = await runs(storage);
    expect(firstRun).toMatchObject({
      requestedModel: 'configured-model',
      settings: { maxSteps: 20, temperature: 0.4, maxOutputTokens: 256, maxRetries: 3 },
    });
    const initialConversations = await conversations(storage);
    expect(initialConversations).toHaveLength(1);
    await fill('Message', 'Continue the same conversation.');
    await openSettings();
    expect(selectField('Maximum steps').value).toBe('20');
    expect(selectField('Maximum output tokens').value).toBe('256');
    expect(selectField('Maximum retries').value).toBe('3');
    await select('Model', 'gpt-6-astra');
    expect(document.body.textContent).not.toContain('Custom model');
    await fill('Instructions', 'Prefer direct answers.');
    await fill('Temperature', '0');
    await act(() => button('Close settings').click());
    expect(field('Message').value).toBe('Continue the same conversation.');
    await submit();
    await act(async () => vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(2)));
    await act(async () => vi.waitFor(() => expect(field('Message').disabled).toBe(false)));
    expect(suppliedModel).toHaveBeenLastCalledWith('gpt-6-astra');
    expect(model.doStreamCalls[1]).toMatchObject({ temperature: 0, maxOutputTokens: 256 });
    expect(model.doStreamCalls[1]?.prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system', content: 'Prefer direct answers.' }),
      ]),
    );
    expect(
      (await conversations(storage)).every((item, index) =>
        sameEntity(item, initialConversations[index]),
      ),
    ).toBe(true);
    expect(await runs(storage)).toHaveLength(2);
  },
);

test('credential settings mask login values and wire save, restore and clear without replacing the draft', async () => {
  const { updateSecret } = await fixture();
  expect(field('OpenAI API key').value).toBe('');
  expect(textField('OpenAI API key').type).toBe('password');
  expect(textField('GitHub token').placeholder).toBe('Configured');
  expect(field('OpenAI API key').disabled).toBe(false);
  expect(document.body.innerHTML).not.toContain('login-github');
  expect(document.body.innerHTML).not.toContain('login-openai');
  expect(document.body.innerHTML).not.toContain('custom-openai');
  expect(document.querySelector('button[aria-label="Clear GitHub token"]')).toBeNull();
  await fill('Message', 'Retain the draft through credential updates.');
  await fill('OpenAI API key', 'replacement-key');
  expect(updateSecret).not.toHaveBeenCalled();
  await act(async () => button('Save OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', 'replacement-key');
  expect(field('OpenAI API key').value).toBe('');
  expect(field('Message').value).toBe('Retain the draft through credential updates.');
  await act(async () => button('Restore login value for OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', undefined);
  await act(async () => button('Clear OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', null);
  expect(textField('OpenAI API key').placeholder).toBe('Not configured');
  expect(field('Message').value).toBe('Retain the draft through credential updates.');
});

test('chat dictation falls back from a missing Realtime endpoint and keeps the configured key and draft', async () => {
  const { track, fetch } = media();
  class Recorder {
    static isTypeSupported = () => true;
    mimeType = 'audio/webm';
    state = 'inactive';
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    start() {
      this.state = 'recording';
    }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob(['fictional audio'], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  fetch.mockReset().mockImplementation((url, init) => {
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer custom-openai');
    if (String(url).endsWith('/realtime/client_secrets'))
      return Promise.resolve(new Response('Fictional missing Realtime endpoint', { status: 404 }));
    expect(String(url)).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(track.stop).toHaveBeenCalled();
    expect(init!.body).toBeInstanceOf(FormData);
    expect((init!.body as FormData).get('model')).toBe('gpt-4o-transcribe');
    return Promise.resolve(Response.json({ text: 'Dictated words.' }));
  });
  vi.stubGlobal('fetch', fetch);
  const { model, storage } = await fixture();
  await select('File transcription model', 'gpt-4o-transcribe');
  await act(() => {
    history.replaceState(null, '', '#/chat/');
    globalThis.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await fill('Message', 'Keep my draft.');
  const start = button('Start voice interaction');
  await act(async () => start.click());
  expect(
    [...document.querySelectorAll('[role="alert"]')].map((element) => element.textContent),
  ).toEqual([]);
  expect(button('Finish recording')).toBeDefined();
  expect(fetch).toHaveBeenCalledOnce();
  await act(async () => button('Finish recording').click());
  expect(field('Message').value).toBe('Keep my draft. Dictated words.');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(model.doStreamCalls).toHaveLength(0);
  expect(await runs(storage)).toEqual([]);
  await act(async () => button('Start voice interaction').click());
  expect(fetch).toHaveBeenCalledTimes(2);
  await act(async () => button('Finish recording').click());
  expect(fetch).toHaveBeenCalledTimes(3);
});

test('pending GitHub replacement blocks new activity and retains the draft and conversation while reconnecting', async () => {
  let release!: () => void;
  const saving = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { storage, model, updateSecret, configure } = await fixture({
    identity: {},
    saveSecret: () => saving,
  });
  await act(() => button('Close settings').click());
  await fill('Message', 'Record the conversation before reconnecting.');
  await submit();
  await act(async () =>
    vi.waitFor(() => expect(button('Start voice interaction').disabled).toBe(false)),
  );
  const initialConversations = await conversations(storage);
  expect(initialConversations).toHaveLength(1);
  const db = await applicationDatabase(storage);
  const recordedHistory = await db.history.transactions.query({ select: { sequence: true } });
  await fill('Message', 'Keep this draft in the same conversation.');
  await openSettings();
  await fill('GitHub token', 'replacement-token');
  await act(() => button('Save GitHub token').click());
  expect(updateSecret).toHaveBeenCalledExactlyOnceWith('github', 'replacement-token');
  expect(field('OpenAI API key').disabled).toBe(true);
  expect(button('Restore login value for OpenAI API key').disabled).toBe(true);
  expect(button('Clear OpenAI API key').disabled).toBe(true);
  await act(() => button('Clear OpenAI API key').click());
  expect(updateSecret).toHaveBeenCalledTimes(1);
  await act(() => button('Close settings').click());
  await act(() => field('Message').focus());
  expect(button('Send').disabled).toBe(true);
  await submit();
  expect(model.doStreamCalls).toHaveLength(1);
  expect(await db.history.transactions.query({ select: { sequence: true } })).toEqual(
    recordedHistory,
  );
  expect(field('Message').value).toBe('Keep this draft in the same conversation.');
  await act(() => field('Message').blur());
  expect(button('Start voice interaction').disabled).toBe(true);
  await act(() => field('Message').focus());
  await configure({ credentialPending: true });
  expect(field('Message').value).toBe('Keep this draft in the same conversation.');
  expect(document.body.textContent).toContain('Record the conversation before reconnecting.');
  expect(document.body.textContent).toContain('Completed settings request.');
  expect(button('Send').disabled).toBe(true);
  await act(async () => {
    release();
  });
  await act(async () => vi.waitFor(() => expect(button('Send').disabled).toBe(false)));
  expect(field('Message').value).toBe('Keep this draft in the same conversation.');
  await submit();
  await act(async () => vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(2)));
  await act(async () =>
    vi.waitFor(() => expect(button('Start voice interaction').disabled).toBe(false)),
  );
  expect(
    (await conversations(storage)).every((item, index) =>
      sameEntity(item, initialConversations[index]),
    ),
  ).toBe(true);
  expect(await runs(storage)).toHaveLength(2);
});

test('active Agent work disables credential changes until the recorded run finishes', async () => {
  let release: () => void = () => {
    throw new Error('Held stream is not initialized');
  };
  const pending = new Promise<StreamResult>((resolve) => {
    release = () => resolve(answer('Finished held Agent work.'));
  });
  const { model, updateSecret } = await fixture({ stream: () => pending });
  expect(field('OpenAI API key').disabled).toBe(false);
  await act(() => button('Close settings').click());
  await fill('Message', 'Hold the Agent run.');
  await submit();
  await act(async () => vi.waitFor(() => expect(model.doStreamCalls).toHaveLength(1)));
  await openSettings();
  expect(field('OpenAI API key').disabled).toBe(true);
  expect(button('Restore login value for OpenAI API key').disabled).toBe(true);
  expect(button('Clear OpenAI API key').disabled).toBe(true);
  expect(document.body.textContent).toContain('Finish or stop the current agent activity');
  expect(updateSecret).not.toHaveBeenCalled();
  await act(async () => {
    release();
    await vi.waitFor(() => expect(field('OpenAI API key').disabled).toBe(false));
  });
});

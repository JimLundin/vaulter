import { expect, test } from '@playwright/test';
import { fakeGitHub } from '../../vault/storage/github-client/fake-github.ts';
import { create, request } from '../../vault/nodes/fixtures.test-support.ts';
import { accept } from '../../vault/nodes/history.ts';
import { digest } from '../../vault/nodes/json.ts';
import { seal } from '../../vault/session/sealed.ts';
// biome-ignore lint/correctness/noUnresolvedImports: Playwright re-exports these browser types.
import type { Page } from '@playwright/test';

async function expectChatRail(page: Page) {
  await expect(page.locator('[data-edge-rail]').getByRole('button')).toHaveCount(2);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const viewport = window.visualViewport!;
        const rail = document.querySelector('[data-edge-rail]')!.getBoundingClientRect();
        const input = document
          .querySelector('[aria-label="Message text box"]')!
          .getBoundingClientRect();
        const dock = document.querySelector('[data-dock]')!;
        return (
          Math.abs(rail.right - (viewport.offsetLeft + viewport.width - 12)) <= 1 &&
          Math.abs(rail.bottom - (viewport.offsetTop + viewport.height - 12)) <= 1 &&
          input.right <= rail.left - 11 &&
          Math.abs(input.bottom - (viewport.offsetTop + viewport.height - 12)) <= 1 &&
          getComputedStyle(dock).backgroundColor === 'rgba(0, 0, 0, 0)'
        );
      }),
    )
    .toBe(true);
}

test.use({
  permissions: ['microphone'],
  launchOptions: {
    ...(process.env.VAULTER_BROWSER ? { executablePath: process.env.VAULTER_BROWSER } : {}),
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

test('production opens one continuous dialogue and imports earlier conversations once', async ({
  page,
}) => {
  const at = '2026-10-13T09:00:00Z';
  const initial = request('chat-fixture', [
    create('user', { kind: 'actor', name: 'Fictional owner' }),
    ...Array.from({ length: 45 }, (_, index) => {
      const node = `chat-${String(index).padStart(2, '0')}`;
      const date = new Date(Date.parse(at) + index * 60_000).toISOString();
      return [
        create(node, { kind: 'conversation', title: node, createdAt: date }),
        create(`${node}-exchange`, { kind: 'exchange', startedAt: date }, node),
        create(
          `${node}-message`,
          { kind: 'message', role: 'user', at: date, text: `Recorded message ${index}` },
          `${node}-exchange`,
        ),
      ];
    }).flat(),
  ]);
  const record = accept([], initial, await digest(initial), at);
  const fake = await fakeGitHub({
    '.vaulter/nodes/v1/transactions/chat-fixture.json': JSON.stringify(record),
  });
  const password = 'fictional-chat-password';
  const sealed = await seal({ github: 'fictional-token' }, password, undefined, 1000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'vaulter:conversation:https://api.github.com:JimLundin/vault@main',
      'missing-retained-chat',
    );
  });
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const response = await fake.fetchFn(
      request.url().replace('https://api.github.com', 'https://gh.test'),
      {
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  await page.goto('/#/chat/');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Message', exact: true })).toBeVisible();
  await expect(page.locator('[data-message]')).toHaveCount(45);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const compact = test.info().project.name === 'phone';
  if (compact) {
    for (const theme of ['light', 'dark']) {
      await page.evaluate((theme) => {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(theme);
      }, theme);
      await expectChatRail(page);
    }
    const draft = page.getByRole('textbox', { name: 'Message', exact: true });
    await draft.fill('Keep this draft above the keyboard.');
    await page.evaluate(() => {
      Object.defineProperties(window.visualViewport!, {
        height: { configurable: true, get: () => 340 },
        offsetTop: { configurable: true, get: () => 100 },
      });
      window.visualViewport!.dispatchEvent(new Event('resize'));
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await expectChatRail(page);
    await expect(draft).toBeFocused();
    await expect(draft).toHaveValue('Keep this draft above the keyboard.');
    const send = page.getByRole('button', { name: 'Send', exact: true });
    // This fixture has no model key, so Send retains its disabled state while staying clear.
    await expect(send).toBeDisabled();
    const sendBox = (await send.boundingBox())!;
    const railBox = (await page.locator('[data-edge-rail]').boundingBox())!;
    expect(sendBox.x + sendBox.width).toBeLessThanOrEqual(railBox.x - 11);
    await page.evaluate(() => {
      Reflect.deleteProperty(window.visualViewport!, 'height');
      Reflect.deleteProperty(window.visualViewport!, 'offsetTop');
      window.visualViewport!.dispatchEvent(new Event('resize'));
      window.visualViewport!.dispatchEvent(new Event('scroll'));
    });
    await expectChatRail(page);
  }
  await expect(page.getByRole('button', { name: 'Conversations', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-message="user"]').first()).toContainText('Recorded message 0');
  await expect(page.locator('[data-message="user"]').last()).toContainText('Recorded message 44');
  await page.reload();
  await expect(page.locator('[data-message]')).toHaveCount(45);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.goto('/#/chat/chat-00/');
  await expect(page.locator('[data-message]')).toHaveCount(45);
  await expect(page.getByRole('button', { name: 'New conversation', exact: true })).toHaveCount(0);
});

test.describe('production recorded dictation', () => {
  test('a configured key and missing Realtime route still allow dictation into an unsent draft', async ({
    page,
  }) => {
    const fake = await fakeGitHub({});
    const password = 'fictional-dictation-password';
    const key = 'fictional-openai-key';
    const sealed = await seal(
      { github: 'fictional-token', openai: key },
      password,
      undefined,
      1000,
    );
    await page.addInitScript(() => {
      localStorage.setItem(
        'vaulter.settings.openai',
        JSON.stringify({ fileTranscriptionModel: 'gpt-4o-transcribe' }),
      );
      const microphone = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      const tracks: MediaStreamTrack[] = [];
      let chunks = 0;
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await microphone(constraints);
        tracks.push(...stream.getTracks());
        return stream;
      };
      const NativeRecorder = MediaRecorder;
      class ObservedRecorder extends NativeRecorder {
        constructor(stream: MediaStream, options?: MediaRecorderOptions) {
          super(stream, options);
          this.addEventListener('dataavailable', ({ data }) => {
            if (data.size) chunks++;
          });
        }
      }
      Reflect.set(globalThis, 'MediaRecorder', ObservedRecorder);
      Reflect.set(globalThis, 'dictationCapture', { tracks, chunks: () => chunks });
    });
    await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
    await page.route('https://api.github.com/**', async (route) => {
      const request = route.request();
      const response = await fake.fetchFn(
        request.url().replace('https://api.github.com', 'https://gh.test'),
        {
          method: request.method(),
          headers: request.headers(),
          body: request.postData(),
        },
      );
      await route.fulfill({
        status: response.status,
        body: await response.text(),
        headers: Object.fromEntries(response.headers),
      });
    });
    let liveRequests = 0;
    let uploads = 0;
    let modelRequests = 0;
    await page.route('https://api.openai.com/v1/**', async (route) => {
      const request = route.request();
      expect(request.headers().authorization).toBe(`Bearer ${key}`);
      if (request.url().endsWith('/realtime/client_secrets')) {
        liveRequests++;
        await route.fulfill({
          status: 404,
          json: { error: { message: 'Fictional unavailable Realtime route' } },
        });
      } else if (request.url().endsWith('/audio/transcriptions')) {
        uploads++;
        expect(request.headers()['content-type']).toContain('multipart/form-data');
        expect(request.postDataBuffer()?.toString()).toContain('gpt-4o-transcribe');
        expect(
          await page.evaluate(() =>
            Reflect.get(globalThis, 'dictationCapture').tracks.every(
              (track: MediaStreamTrack) => track.readyState === 'ended',
            ),
          ),
        ).toBe(true);
        await route.fulfill({ json: { text: 'Dictated words for review.' } });
      } else {
        modelRequests++;
        await route.fulfill({
          status: 500,
          json: { error: { message: 'Browsing must not submit a message' } },
        });
      }
    });
    await page.goto('/#/chat/');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Open vault', exact: true }).click();
    const input = page.getByRole('textbox', { name: 'Message', exact: true });
    await expect(input).toBeEnabled();
    await input.fill('Keep this draft.');
    await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true });
    await input.dispatchEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true });
    await expect(input).toHaveValue('Keep this draft.');
    await input.press('End');
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('Keep this draft.\n');
    await input.fill('Keep this draft.');
    await input.blur();
    if (test.info().project.name === 'phone') await expectChatRail(page);
    await page.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finish recording', exact: true })).toBeVisible();
    if (test.info().project.name === 'phone') await expectChatRail(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => Reflect.get(globalThis, 'dictationCapture').chunks()))
      .toBeGreaterThan(0);
    expect(liveRequests).toBe(1);
    expect(uploads).toBe(0);
    await page.getByRole('button', { name: 'Finish recording', exact: true }).click();
    await expect(input).toHaveValue('Keep this draft. Dictated words for review.');
    await input.focus();
    const send = page.getByRole('button', { name: 'Send', exact: true });
    await expect(send).toBeEnabled();
    expect(
      await send.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        const target = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return target === node || node.contains(target);
      }),
    ).toBe(true);
    await expect(page.locator('[data-message]')).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(uploads).toBe(1);
    expect(modelRequests).toBe(0);
  });
});

test('production saves a new chat to EAV and restores it without reexecuting the Agent', async ({
  page,
}) => {
  const fake = await fakeGitHub({ 'Retained.md': 'Untouched' });
  const sealed = await seal(
    { github: 'fictional-token', openai: 'fictional-key' },
    'eav-password',
    undefined,
    1000,
  );
  await page.route('**/secrets.json', (route) => route.fulfill({ json: sealed }));
  await page.route('https://api.github.com/**', async (route) => {
    const request = route.request();
    const response = await fake.fetchFn(
      request.url().replace('https://api.github.com', 'https://gh.test'),
      {
        method: request.method(),
        headers: request.headers(),
        body: request.postData(),
      },
    );
    await route.fulfill({
      status: response.status,
      body: await response.text(),
      headers: Object.fromEntries(response.headers),
    });
  });
  let calls = 0;
  await page.route('https://api.openai.com/v1/responses', async (route) => {
    if (!route.request().postDataJSON().stream) {
      await route.fulfill({
        status: 503,
        json: { error: { message: 'Suggestions unavailable in this fixture' } },
      });
      return;
    }
    calls++;
    const reply =
      calls === 2 ? 'Saved context\nThe user asked to remember this in EAV.' : 'Retained EAV reply';
    const item = {
      type: 'message',
      id: 'msg',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: reply, annotations: [] }],
    };
    const response = {
      id: 'response',
      object: 'response',
      created_at: 1,
      model: 'fixture-model',
      status: 'completed',
      output: [item],
      usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
    };
    const events = [
      { type: 'response.created', response },
      { type: 'response.output_item.added', output_index: 0, item },
      {
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: reply,
      },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    });
  });
  await page.goto('/#/chat/');
  await page.getByLabel('Password', { exact: true }).fill('eav-password');
  await page.getByRole('button', { name: 'Open vault', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Remember this in EAV');
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeEnabled();
  await input.press('Enter');
  await expect(page.getByText('Retained EAV reply', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  await expect(page).toHaveURL(/#\/chat\/$/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect
    .poll(
      () =>
        Object.keys(fake.filesAt()).filter((path) => path.startsWith('.vaulter/eav/transactions/'))
          .length,
    )
    .toBeGreaterThanOrEqual(4);
  const journal = Object.entries(fake.filesAt())
    .filter(([path]) => path.startsWith('.vaulter/eav/'))
    .map(([, value]) => value)
    .join('\n');
  expect(journal).toContain('chat.message');
  expect(journal).toContain('agent.run');
  expect(journal).not.toContain('fictional-key');
  expect(fake.filesAt()['Retained.md']).toBe('Untouched');
  expect(calls).toBe(1);
  const timelineButton = page.getByRole('button', { name: 'Timeline', exact: true });
  if (await timelineButton.isVisible()) await timelineButton.click();
  const timeline = page
    .getByRole('complementary', { name: 'Timeline', exact: true })
    .or(page.getByRole('dialog', { name: 'Timeline', exact: true }));
  await timeline.getByRole('button', { name: 'Create checkpoint', exact: true }).click();
  await expect(timeline.getByRole('status')).toHaveText(
    'Checkpoint saved for future Agent context.',
  );
  await timeline.getByRole('button', { name: 'Saved context', exact: true }).click();
  await expect(timeline).toContainText('The user asked to remember this in EAV.');
  expect(calls).toBe(2);
  await page.reload();
  await expect(page.getByText('Retained EAV reply', { exact: true })).toBeVisible();
  await expect(page.locator('[data-message="user"]')).toContainText('Remember this in EAV');
  if (await timelineButton.isVisible()) await timelineButton.click();
  await expect(timeline.getByRole('button', { name: 'Saved context', exact: true })).toBeVisible();
  expect(calls).toBe(2);
});

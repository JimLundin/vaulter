import { expect, test } from '@playwright/test';

test('live preview streams through the Responses adapter and records real provider attribution', async ({
  page,
}) => {
  const calls: { model: string; store: boolean }[] = [];
  await page.addInitScript(() => {
    const attempts: string[] = [];
    Object.defineProperty(globalThis, 'dynamicCodeAttempts', { value: attempts });
    const deny = () => {
      attempts.push('Function');
      throw new EvalError('Dynamic code generation is disabled in this test.');
    };
    globalThis.Function = new Proxy(globalThis.Function, { apply: deny, construct: deny });
  });
  await page.addInitScript(() => localStorage.setItem('vault.agent.model', 'fixture-llm'));
  await page.route('**/__preview-agent/v1/responses', async (route) => {
    calls.push(route.request().postDataJSON());
    expect(route.request().headers().authorization).toBe('Bearer local-preview');
    const item = {
      type: 'message',
      id: 'message-fixture',
      status: 'completed',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Live adapter reply', annotations: [] }],
    };
    const response = {
      id: 'resp-fixture',
      object: 'response',
      created_at: 1,
      model: 'fixture-llm',
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
        delta: 'Live adapter reply',
      },
      { type: 'response.output_item.done', output_index: 0, item },
      { type: 'response.completed', response },
    ];
    await route.fulfill({
      contentType: 'text/event-stream',
      body: events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    });
  });
  await page.goto('/preview/?agent=live');
  await expect(page.getByText('Live agent preview · local', { exact: false })).toBeVisible();
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Test the live adapter');
  await input.press('Enter');
  await expect(page.getByText('Live adapter reply', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeHidden();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ model: 'fixture-llm', store: false });
  expect(await page.evaluate(() => Reflect.get(globalThis, 'dynamicCodeAttempts'))).toEqual([]);
  const journal = await page.evaluate(() => sessionStorage.getItem('vaulter:preview:accepted:v1'));
  expect(journal).toContain('"provider":"openai"');
  expect(journal).not.toContain('local-preview');
  await page.reload();
  await expect(page.getByText('Live adapter reply', { exact: true })).toBeVisible();
  expect(calls).toHaveLength(1);
});

test('live dictation captures browser audio, transcribes on Finish and appends without sending', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const startRecording = MediaRecorder.prototype.start;
    MediaRecorder.prototype.start = function (timeslice) {
      document.documentElement.dataset.recordingData = '';
      this.addEventListener('dataavailable', () => {
        document.documentElement.dataset.recordingData = 'ready';
      });
      startRecording.call(this, timeslice);
    };
    navigator.mediaDevices.getUserMedia = () => {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const destination = audio.createMediaStreamDestination();
      oscillator.connect(destination);
      oscillator.start();
      return Promise.resolve(destination.stream);
    };
  });
  const recordings: Buffer[] = [];
  await page.route('**/__preview-agent/v1/audio/transcriptions', async (route) => {
    expect(route.request().headers().authorization).toBe('Bearer local-preview');
    const recording = route.request().postDataBuffer()!;
    recordings.push(recording);
    expect(recording.length).toBeGreaterThan(1000);
    expect(recording.toString()).toContain('name="file"; filename="recording.webm"');
    expect(recording.toString()).toContain('gpt-4o-transcribe');
    await route.fulfill({
      json: { text: recordings.length === 1 ? 'Spoken words.' : 'More words.' },
    });
  });
  await page.goto('/preview/?agent=live');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('My typed draft.');
  await input.blur();
  const start = page.getByRole('button', { name: 'Start voice interaction', exact: true });
  await start.click();
  const finish = page.getByRole('button', { name: 'Finish recording', exact: true });
  await expect(finish).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.recordingData === 'ready');
  expect(recordings).toHaveLength(0);
  await expect(input).toHaveValue('My typed draft.');
  await finish.click();
  await expect(input).toHaveValue('My typed draft. Spoken words.');
  await expect(page.locator('[data-message="user"]')).toHaveCount(0);
  await start.click();
  await expect(finish).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.recordingData === 'ready');
  await finish.click();
  await expect(input).toHaveValue('My typed draft. Spoken words. More words.');
  expect(recordings).toHaveLength(2);
  await expect(page.locator('[data-message="user"]')).toHaveCount(0);
});

test('live microphone permission errors preserve the typed draft without a transcription request', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () =>
      Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  let requests = 0;
  await page.route('**/__preview-agent/v1/audio/transcriptions', async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto('/preview/?agent=live');
  const input = page.getByRole('textbox', { name: 'Message', exact: true });
  await input.fill('Keep this draft');
  await input.blur();
  await page.getByRole('button', { name: 'Start voice interaction', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Microphone access was denied');
  await expect(input).toHaveValue('Keep this draft');
  expect(requests).toBe(0);
});

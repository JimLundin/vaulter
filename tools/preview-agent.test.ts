import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { createServer, resolveConfig } from 'vite';
import { expect, test } from 'vitest';
import { previewAgent, previewAgentPath, previewTranscriptionPath } from './preview-agent.ts';

test('proxy replaces browser credentials, retains streamed responses and rejects other requests', async () => {
  const requests: { path?: string; authorization?: string; cookie?: string; body: string }[] = [];
  const upstream = createHttpServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({
        path: request.url,
        authorization: request.headers.authorization,
        cookie: request.headers.cookie,
        body: Buffer.concat(chunks).toString(),
      });
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write('data: first\n\n');
      setTimeout(() => response.end('data: last\n\n'), 10);
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const targetPort = (upstream.address() as AddressInfo).port;
  const configuration = previewAgent({
    FOUNDRY_TOKEN: 'server-fixture-secret',
    VAULT_OPENAI_API: `http://127.0.0.1:${targetPort}/custom/v1/`,
  })!;
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [configuration.guard],
    server: { host: '127.0.0.1', port: 0, proxy: configuration.proxy },
  });
  try {
    await server.listen();
    const { port } = server.httpServer!.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(`${origin}${previewAgentPath}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Authorization: 'Bearer browser-placeholder',
        Cookie: 'private-browser-cookie',
        'Content-Type': 'application/json',
      },
      body: '{"model":"fixture","stream":true}',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    expect(await response.text()).toBe('data: first\n\ndata: last\n\n');
    expect(requests).toEqual([
      {
        path: '/custom/v1/responses',
        authorization: 'Bearer server-fixture-secret',
        cookie: undefined,
        body: '{"model":"fixture","stream":true}',
      },
    ]);
    const audio = new FormData();
    audio.append('file', new Blob(['fixture audio'], { type: 'audio/webm' }), 'recording.webm');
    audio.append('model', 'gpt-4o-transcribe');
    const uploaded = await fetch(`${origin}${previewTranscriptionPath}`, {
      method: 'POST',
      headers: { Origin: origin, Authorization: 'Bearer browser-placeholder' },
      body: audio,
    });
    expect(uploaded.status).toBe(200);
    await uploaded.text();
    expect(requests[1]).toMatchObject({
      path: '/custom/v1/audio/transcriptions',
      authorization: 'Bearer server-fixture-secret',
    });
    expect(requests[1]!.body).toContain('fixture audio');
    expect(requests[1]!.body).toContain('gpt-4o-transcribe');
    for (const [path, init, status] of [
      [previewAgentPath, { method: 'GET' }, 405],
      [previewTranscriptionPath, { method: 'GET' }, 405],
      [
        previewTranscriptionPath,
        { method: 'POST', headers: { Origin: 'https://other.example' } },
        403,
      ],
      ['/__preview-agent/v1/models', { method: 'POST' }, 404],
      [`${previewAgentPath}?other=1`, { method: 'POST' }, 404],
      [previewAgentPath, { method: 'POST', headers: { Origin: 'https://other.example' } }, 403],
      [previewAgentPath, { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' } }, 403],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: each request checks a different guard.
      expect((await fetch(`${origin}${path}`, init)).status).toBe(status);
    }
    expect(requests).toHaveLength(2);
    expect(JSON.stringify(configuration.client)).not.toContain('server-fixture-secret');
  } finally {
    await server.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
});

test('Foundry credentials require an endpoint and explicit OpenAI credentials work independently', () => {
  expect(previewAgent({ FOUNDRY_TOKEN: 'fixture' })).toBeNull();
  expect(previewAgent({ VAULT_OPENAI_API: 'https://proxy.example/v1' })).toBeNull();
  expect(previewAgent({ OPENAI_API_KEY: 'fixture' })?.client).toEqual({
    baseURL: '/__preview-agent/v1',
    defaultModel: undefined,
    transcriptionModel: 'gpt-4o-transcribe',
  });
  expect(
    previewAgent({
      OPENAI_API_KEY: 'fixture',
      OPENAI_BASE_URL: 'https://proxy.example',
      OPENAI_MODEL: 'configured-model',
    })?.client.defaultModel,
  ).toBe('configured-model');
});

test('production and published preview builds have no live-agent connection or credentials', async () => {
  for (const mode of ['production', 'design']) {
    // biome-ignore lint/performance/noAwaitInLoops: inspect both build modes independently.
    const configuration = await resolveConfig({ mode }, 'build');
    expect(configuration.define?.__PREVIEW_AGENT__).toBe('null');
    expect(configuration.define?.__DEV_SECRETS__).toBe('null');
    expect(configuration.plugins.some((plugin) => plugin.name === 'preview-agent')).toBe(false);
    expect(configuration.server.proxy).toBeUndefined();
  }
});

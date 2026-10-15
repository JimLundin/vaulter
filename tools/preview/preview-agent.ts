import type { Plugin, ProxyOptions } from 'vite';

export const previewAgentPath = '/__preview-agent/v1/responses';
export const previewTranscriptionPath = '/__preview-agent/v1/audio/transcriptions';

/** The development server owns the credential; only connection metadata reaches the browser. */
export function previewAgent(env: Record<string, string | undefined>) {
  const apiKey = env.VAULT_OPENAI_KEY || env.OPENAI_API_KEY || env.FOUNDRY_TOKEN;
  if (!apiKey) return null;
  const configuredApi = env.VAULT_OPENAI_API || env.OPENAI_BASE_URL;
  // A Foundry token must have an explicit endpoint rather than going to api.openai.com.
  if (!(configuredApi || env.VAULT_OPENAI_KEY || env.OPENAI_API_KEY)) return null;
  const root = (configuredApi || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const target = root.endsWith('/v1') ? root : `${root}/v1`;
  const proxy: ProxyOptions = {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace('/__preview-agent/v1', ''),
    configure(server) {
      server.on('proxyReq', (request) => {
        request.setHeader('authorization', `Bearer ${apiKey}`);
        request.removeHeader('cookie');
      });
    },
  };
  const guard: Plugin = {
    name: 'preview-agent',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url?.startsWith('/__preview-agent/')) return next();
        response.setHeader('Cache-Control', 'no-store');
        if (request.url !== previewAgentPath && request.url !== previewTranscriptionPath) {
          response.writeHead(404).end();
          return;
        }
        const { origin } = request.headers;
        if (
          request.headers['sec-fetch-site'] === 'cross-site' ||
          (origin &&
            origin !== `http://${request.headers.host}` &&
            origin !== `https://${request.headers.host}`)
        ) {
          response.writeHead(403).end();
          return;
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { Allow: 'POST' }).end();
          return;
        }
        next();
      });
    },
  };
  return {
    client: {
      baseURL: '/__preview-agent/v1',
      defaultModel: env.VAULT_OPENAI_MODEL || env.OPENAI_MODEL || undefined,
      transcriptionModel: env.VAULT_OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
    },
    proxy: {
      [`^${previewAgentPath}$`]: proxy,
      [`^${previewTranscriptionPath}$`]: proxy,
    },
    guard,
  };
}

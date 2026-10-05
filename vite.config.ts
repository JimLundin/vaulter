/// <reference types="vitest/config" />
// The page: the kernel (src/) and every extension, built by CI. Each extension's code is a chunk of its
// own (assets/ext/<id>.<hash>.js), so an error's stack says whose code threw it (src/kernel/errors.ts).
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const extensionOf = (id: string) => /\/extensions\/([^/]+)\//.exec(id)?.[1];
const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The page's Content Security Policy: scripts only from the page itself, network only to OpenAI.
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.openai.com",
      "font-src 'self'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join('; ');
    return html.replace(
      '<head>',
      `<head>\n  <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
});

export default defineConfig({
  base: './',
  plugins: [csp()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: at('index.html'), sw: at('src/sw.ts') },
      // The service worker sits at the root, so its scope is the whole app.
      output: {
        entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name].[hash].js',
        // Each module in its extension's chunk, not in the chunk of whatever imports it first.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: (id) => extensionOf(id) && `ext/${extensionOf(id)}` },
            { name: 'vendor', test: /node_modules/ },
          ],
        },
      },
    },
  },
  test: {
    include: ['{src,contracts,extensions}/**/*.test.{ts,tsx}'],
    setupFiles: ['src/kernel/test-setup.ts'],
    unstubGlobals: true,
  },
});

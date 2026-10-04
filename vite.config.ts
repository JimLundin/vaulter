/// <reference types="vitest/config" />
// The kernel bundle: src/kernel and the bootstrap extensions it ships with. Every other extension and
// every contract is compiled in the browser from the repo (ARCHITECTURE.md, "The kernel").
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The built page's Content Security Policy. Compiled extensions run as blob: modules; network goes only
// to GitHub (the source) and OpenAI. Styles may be inline (React style props).
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self' blob:",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.github.com https://api.openai.com",
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
  resolve: {
    alias: [
      { find: '@pip/kernel', replacement: at('src/kernel/api.ts') },
      { find: /^@contracts\/([^/]+)$/, replacement: at('contracts/$1/index.ts') },
      { find: /^@contracts\/(.+)$/, replacement: at('contracts/$1') },
    ],
  },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['{src,contracts,extensions}/**/*.test.{ts,tsx}'] },
});

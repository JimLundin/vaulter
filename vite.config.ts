/// <reference types="vitest/config" />
// The page: the kernel (src/) and every extension, built by CI.
import { defineConfig, type Plugin } from 'vite';

// The page's Content Security Policy: scripts only from the page itself, network only to OpenAI.
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self'",
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
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    unstubGlobals: true,
  },
});

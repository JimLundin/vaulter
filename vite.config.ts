/// <reference types="vitest/config" />
// The page: the kernel (src/), with main's extensions and contracts as source text, which the browser
// compiles (ARCHITECTURE.md, "Main is the page's own"); drafts come from the repo at runtime.
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The page's Content Security Policy. Compiled extensions load as blob: modules; network goes only to
// GitHub (the source) and OpenAI.
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      "script-src 'self' blob:",
      "worker-src 'self'",
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: at('index.html'), sw: at('src/sw.ts') },
      // The service worker sits at the root, so its scope is the whole app.
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  test: {
    include: ['{src,contracts,extensions}/**/*.test.{ts,tsx}'],
    setupFiles: ['src/kernel/test-setup.ts'],
    unstubGlobals: true,
  },
});

/// <reference types="vitest/config" />
// The kernel bundle: src/ and the bootstrap source provider it ships with. Every other extension and
// every contract is compiled in the browser from the repo (ARCHITECTURE.md, "The kernel").
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build, defineConfig, type Plugin } from 'vite';

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const alias = [
  { find: '@pip/kernel', replacement: at('src/kernel/api.ts') },
  { find: /^@contracts\/([^/]+)$/, replacement: at('contracts/$1/index.ts') },
  { find: /^@contracts\/(.+)$/, replacement: at('contracts/$1') },
];

// A sandbox's only inline script, allowed by its hash: here, and in the frame's own policy (realm.ts).
const BOOT = `'sha256-${createHash('sha256')
  .update(readFileSync(at('src/sandbox/boot.js')))
  .digest('base64')}'`;

// The kernel page's Content Security Policy. Extensions run in sandboxed srcdoc frames, whose own policy
// forbids all network; the kernel's network, which it makes for them, goes only to GitHub (the source)
// and OpenAI.
const csp = (): Plugin => ({
  name: 'csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'none'",
      `script-src 'self' blob: ${BOOT}`,
      "worker-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self' https://api.github.com https://api.openai.com",
      "frame-src 'self'",
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

// The code every sandbox runs, as text the kernel sends it (realm.ts): src/sandbox/core.ts (the
// runtime, the kernel API and Zod) and src/sandbox/ui.ts (React), each one self-contained module.
const sandboxBundles = (): Plugin => {
  const ID = '\0virtual:sandbox-bundles';
  let made: Promise<string> | undefined;
  const one = async (entry: string) => {
    const out = await build({
      configFile: false,
      logLevel: 'warn',
      resolve: { alias },
      define: { 'process.env.NODE_ENV': JSON.stringify('production') },
      build: {
        write: false,
        minify: true,
        lib: { entry: at(entry), formats: ['es'], fileName: 'bundle' },
        rolldownOptions: { output: { codeSplitting: false } },
      },
    });
    const [result] = Array.isArray(out) ? out : [out];
    return (result as { output: { code?: string }[] }).output[0].code!;
  };
  return {
    name: 'sandbox-bundles',
    resolveId: (id) => (id === 'virtual:sandbox-bundles' ? ID : undefined),
    load(id) {
      if (id !== ID) return;
      made ??= Promise.all([one('src/sandbox/core.ts'), one('src/sandbox/ui.ts')]).then(
        ([core, ui]) =>
          `export const core = ${JSON.stringify(core)};\nexport const ui = ${JSON.stringify(ui)};`,
      );
      return made;
    },
    // Under `npm run dev`, a change to the runtime rebuilds the bundles on the next reload.
    watchChange(file) {
      if (file.includes('/src/')) made = undefined;
    },
    handleHotUpdate({ file, server }) {
      if (!file.includes('/src/')) return;
      made = undefined;
      const m = server.moduleGraph.getModuleById(ID);
      if (m) server.moduleGraph.invalidateModule(m);
    },
  };
};

export default defineConfig({
  base: './',
  plugins: [csp(), sandboxBundles()],
  resolve: { alias },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rolldownOptions: {
      input: { index: at('index.html'), sw: at('src/sw.ts') },
      // The service worker sits at the root, so its scope is the whole app.
      output: { entryFileNames: (c) => (c.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js') },
    },
  },
  test: { include: ['{src,contracts,extensions}/**/*.test.{ts,tsx}'] },
});

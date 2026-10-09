// PROTOTYPE: embed the exact store logic and Dexie into one file that opens without a server.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const directory = `${root}app/vault/nodes/spike/`;
const output = await build({
  configFile: false,
  logLevel: 'warn',
  build: {
    write: false,
    target: 'es2023',
    lib: {
      entry: `${root}tools/node-storage-spike-browser.ts`,
      name: 'NodeStorageSpike',
      formats: ['iife'],
    },
    minify: true,
  },
});
const bundles = Array.isArray(output) ? output : [output];
const chunk = bundles
  .flatMap((bundle) => ('output' in bundle ? bundle.output : []))
  .find((item) => item.type === 'chunk');
if (!chunk) throw new Error('No browser bundle emitted');
const template = await readFile(`${directory}demo.template.html`, 'utf8');
await writeFile(
  `${directory}demo.html`,
  template.replace('/* SPIKE_BUNDLE */', () => chunk.code.replace(/<\/script/gi, '<\\/script')),
);
console.log('Open app/vault/nodes/spike/demo.html in a browser.');

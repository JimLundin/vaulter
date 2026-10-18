// Build-time document export only. The deployed artifact is dist/client.
import { writeFile } from 'node:fs/promises';
const { default: document } = await import('../dist/server/entry-server.js');
const response = await document.fetch(new Request('http://prototype.invalid/'));
if (!response.ok) throw new Error(`Document export failed: ${response.status}`);
await writeFile('dist/client/index.html', await response.text());
console.log('Exported static SPA document to dist/client/index.html');

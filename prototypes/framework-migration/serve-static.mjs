// Serve only static files, with an SPA fallback. No application server behavior.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const [directory, port = '5181'] = process.argv.slice(2);
const root = resolve(directory);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
createServer(async (request, response) => {
  let path = resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname));
  if (!(path === root || path.startsWith(root + sep))) { response.writeHead(403).end(); return; }
  try { if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html'); await stat(path); }
  catch { if (extname(path)) { response.writeHead(404).end(); return; } path = resolve(root, 'index.html'); }
  response.setHeader('Content-Type', types[extname(path)] ?? 'application/octet-stream');
  response.end(await readFile(path));
}).listen(Number(port), '0.0.0.0', () => console.log(`Static prototype: http://localhost:${port}/`));

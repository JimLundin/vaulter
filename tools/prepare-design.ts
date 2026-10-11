// Make the alternate Vite entry the root of its own deployable site, preserving relative assets.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const html = readFileSync('dist-preview/preview/index.html', 'utf8');
writeFileSync('dist-preview/index.html', html.replaceAll('../assets/', './assets/'));
// Retain the module-entry pages and their relative asset paths. Only the root is relocated.
rmSync('dist-preview/preview/index.html');

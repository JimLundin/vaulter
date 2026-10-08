// Make the alternate Vite entry the root of its own deployable site, preserving relative assets.
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const html = readFileSync('dist-preview/preview/index.html', 'utf8');
writeFileSync('dist-preview/index.html', html.replaceAll('../assets/', './assets/'));
rmSync('dist-preview/preview', { recursive: true });

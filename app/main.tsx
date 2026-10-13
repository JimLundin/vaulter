// Bootstrap the current product with its production storage adapters.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import './ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { Product } from './product.tsx';
import { startTheme } from './ui/kit/index.ts';
import type { OpenBackend } from './vault/storage/backend.ts';
import { githubBackend } from './vault/storage/github/index.ts';
import { githubNodeBackend } from './vault/storage/nodes/github.ts';
import type { OpenNodes } from './vault/nodes/store.ts';

const openBackend: OpenBackend = ({ secrets, keeps }) =>
  githubBackend({
    token: secrets.github,
    api: import.meta.env.VITE_GITHUB_API || undefined,
    keeps,
  });

startTheme();
const openNodes: OpenNodes = ({ secrets }) =>
  githubNodeBackend({
    token: secrets.github,
    api: import.meta.env.VITE_GITHUB_API || undefined,
  });
createRoot(document.getElementById('app')!).render(
  <Product openBackend={openBackend} openNodes={openNodes} />,
);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

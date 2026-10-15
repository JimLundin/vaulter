// Bootstrap the current product with its production storage adapters.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import './ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { Application } from './application/index.tsx';
import { startTheme } from './ui/kit/index.ts';
import type { OpenNodes } from './vault/session/adapters.ts';
import { githubNodeBackend } from './vault/storage/nodes/github.ts';

startTheme();
const openNodes: OpenNodes = ({ secrets }) =>
  githubNodeBackend({
    token: secrets.github,
    api: import.meta.env.VITE_GITHUB_API || undefined,
  });
createRoot(document.getElementById('app')!).render(<Application openNodes={openNodes} />);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

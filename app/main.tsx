// Where the app is put together: the platform (core/), the features (extensions/index.ts) and the backend
// (GitHub). The only file that names all of them.
// The stylesheets first: theme.css declares the cascade layers, which every later stylesheet joins.
import './core/theme.css';
import './core/base.css';
import './core/prose.css';
import { createRoot } from 'react-dom/client';
import { App } from './core/App.tsx';
import { applyTheme } from './core/theme.ts';
import type { OpenBackend } from './core/backend.ts';
import { EXTENSIONS } from './extensions/index.ts';
import { githubBackend } from './backends/github/index.ts';

const openBackend: OpenBackend = ({ secrets, key, keeps }) =>
  githubBackend({
    token: secrets.github,
    key,
    api: import.meta.env.VITE_GITHUB_API || undefined,
    keeps,
  });

applyTheme();
createRoot(document.getElementById('app')!).render(
  <App extensions={EXTENSIONS} openBackend={openBackend} />,
);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

// The stylesheets first: theme.css declares the cascade layers, which every later stylesheet joins.
import './shell/theme.css';
import './shell/base.css';
import './shell/prose.css';
import { createRoot } from 'react-dom/client';
import { App } from './shell/App.tsx';
import { applyTheme } from './shell/theme.ts';

applyTheme();
createRoot(document.getElementById('app')!).render(<App />);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

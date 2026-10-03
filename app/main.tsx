// The stylesheets first: theme.css declares the cascade layers, which every later stylesheet joins.
import './core/theme.css';
import './core/base.css';
import { createRoot } from 'react-dom/client';
import { App } from './core/App.tsx';
import { applyTheme } from './core/theme.ts';

applyTheme();
createRoot(document.getElementById('app')!).render(<App />);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

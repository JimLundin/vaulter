import { createRoot } from 'react-dom/client';
import { App } from './core/App.tsx';
import './core/base.css';

createRoot(document.getElementById('app')!).render(<App />);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

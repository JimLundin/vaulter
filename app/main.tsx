import { createPersistentStorage } from './core/store/index.ts';
import { githubEavAdapter } from './core/persistence/journal/github.ts';
// Bootstrap the current product with its production storage adapters.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import './shared/ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { Application } from './application/presentation/index.tsx';
import { startTheme } from './shared/ui/kit/index.ts';
import type { OpenJournal } from './core/session/adapters.ts';

startTheme();
const openJournal: OpenJournal = ({ secrets, api }) =>
  createPersistentStorage(
    githubEavAdapter({
      api: api ?? (import.meta.env.VITE_GITHUB_API || undefined),
      token: () => {
        const token = secrets()?.github;
        if (!token) throw new Error('The vault session has closed.');
        return token;
      },
    }),
  );
createRoot(document.getElementById('app')!).render(<Application openJournal={openJournal} />);

if (!import.meta.env.DEV && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js');

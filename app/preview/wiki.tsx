import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import { createRoot } from 'react-dom/client';
import '@/ui/kit/styles.css';
import { DesignPreview, startTheme } from '@/ui/kit/index.ts';
import { WikiExample } from './wiki-example.tsx';

startTheme();
createRoot(document.getElementById('app')!).render(
  <DesignPreview
    label="Fictional Wiki records"
    kitHref={import.meta.env.DEV ? '/ui/kit/' : '../kit/'}
    onReset={() => location.reload()}
  >
    <WikiExample controls={true} />
  </DesignPreview>,
);

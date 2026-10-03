// The agent (#/agent/): files Captures, answers from the vault, and commits on its own, following
// meta/conventions.md. Needs the sealed OpenAI key and a backend that can write. The view loads when
// it's opened (its chat components stay out of the main bundle), like the SDK it loads in turn.
// biome-ignore lint/correctness/noUnresolvedImports: Suspense is in @types/react's namespace, which Biome doesn't follow
import { lazy, Suspense } from 'react';
import type { Extension } from '../../core/extension.ts';
import { Loading } from '@/components/layout.tsx';

const Agent = lazy(() => import('./Agent.tsx').then((m) => ({ default: m.Agent })));

export const agent: Extension = {
  id: 'agent',
  page: (path) =>
    path === '/agent/'
      ? {
          title: 'Agent',
          body: (
            <Suspense fallback={<Loading />}>
              <Agent />
            </Suspense>
          ),
        }
      : null,
  nav: [
    {
      label: 'Agent',
      href: '/agent/',
      order: 70,
      summary: 'File, ask, sign off',
      when: (h) => !!h.secrets,
    },
  ],
};

// Typed fictional records exercise the Wiki view's actual public presentation and actions.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../ui/kit/styles.css';
import { Button, DesignPreview, Stack } from '../ui/kit/index.ts';
import { Wiki } from '../workflows/wiki/index.tsx';
import type { WikiPage, WikiReference } from '../workflows/wiki/pages.ts';

const context = 'Earlier plans. '.repeat(40) + 'Keep mornings free.' + ' Later details.'.repeat(40);
const reference: WikiReference = {
  id: 'citation',
  title: 'Studio plans',
  text: 'Keep mornings free.',
  context,
  range: { start: 600, end: 619 },
  claim: { start: 0, end: 19 },
  source: { node: 'message', transaction: 'retained' },
  sequence: 1,
  state: 'newer',
  href: '#/chat/planning/',
  author: 'Fictional owner',
};
const page: WikiPage = {
  id: 'studio',
  title: 'Garden studio',
  summary: 'Room for making things.',
  kind: 'page',
  updated: '2026-10-11',
  entry: { href: '/wiki/studio/', t: 'Garden studio', e: '', a: [], k: 'topic', g: [] },
  metadata: [
    {
      id: 'creative',
      relationship: 'tag',
      scheme: 'tag',
      key: 'creative',
      label: 'Creative work',
      state: 'resolved',
    },
  ],
  sources: Array.from({ length: 12 }, (_, i) => ({
    ...reference,
    id: `source-${i}`,
    title: `Planning note ${i + 1}`,
    range: undefined,
    claim: undefined,
    state: i === 1 ? 'deleted' : 'original',
  })),
  blocks: [
    {
      id: 'claim',
      data: { kind: 'paragraph', text: 'Keep mornings free. Afternoons are flexible.' },
      children: [],
      evidence: [reference],
    },
    {
      id: 'question',
      data: { kind: 'question', text: 'Which tools should stay?' },
      children: [],
      evidence: [],
    },
  ],
};

function Example() {
  const [state, setState] = useState('page');
  return (
    <Stack fill={true}>
      <Wiki
        pages={state === 'loading' ? null : [page]}
        node={state === 'missing' ? 'missing' : 'studio'}
        error={state === 'error' ? 'Fictional read failed.' : undefined}
      />
      <Stack>
        <Button onClick={() => setState(state === 'page' ? 'loading' : 'page')}>
          Toggle loading
        </Button>
        <Button onClick={() => setState('error')}>Show error</Button>
        <Button onClick={() => setState('missing')}>Show unavailable page</Button>
      </Stack>
    </Stack>
  );
}
createRoot(document.getElementById('app')!).render(
  <DesignPreview
    label="Fictional Wiki records"
    kitHref="/ui/kit/"
    onReset={() => location.reload()}
  >
    <Example />
  </DesignPreview>,
);

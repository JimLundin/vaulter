// Explicit preview adapter: fictional NodeStore -> production Wiki reader -> production record UI.
import { useEffect, useState } from 'react';
import { Button, Stack, Text } from '../ui/kit/index.ts';
import { memoryNodeBackend } from '../vault/nodes/memory.ts';
import type { NodeStore } from '../vault/nodes/store.ts';
import { Wiki } from '../workflows/wiki/index.tsx';
import { readWiki, pageRoute, type WikiPage } from '../workflows/wiki/pages.ts';
import { seedPreviewRecords } from './records.ts';

export function WikiExample({ controls = false }: { controls?: boolean }) {
  const [pages, setPages] = useState<WikiPage[] | null>(null);
  const [error, setError] = useState('');
  const [state, setState] = useState('page');
  const [selected, setSelected] = useState<string | undefined>('preview:page:0');
  useEffect(() => {
    const nodes = memoryNodeBackend();
    let active = true;
    const read = async (store: NodeStore) => {
      await seedPreviewRecords(store);
      const loaded = await readWiki(
        store,
        (node) => `${import.meta.env.DEV ? '/preview/' : '../'}#/chat/${node}/`,
      );
      if (active) setPages(loaded);
    };
    void read(nodes).catch((problem: unknown) => {
      if (active) setError(String(problem));
    });
    return () => {
      active = false;
      nodes.close();
    };
  }, []);
  return (
    <Stack fill={true}>
      <Wiki
        pages={state === 'loading' ? null : pages}
        node={state === 'missing' ? 'missing' : selected}
        onNavigate={(path) => setSelected(pageRoute.match(path)?.node)}
        error={state === 'error' ? 'Fictional read failed.' : error}
      />
      {controls && (
        <Stack>
          <Button onClick={() => setState(state === 'page' ? 'loading' : 'page')}>
            Toggle loading
          </Button>
          <Button onClick={() => setState('error')}>Show error</Button>
          <Button onClick={() => setState('missing')}>Show unavailable page</Button>
          {error && <Text tone="danger">{error}</Text>}
        </Stack>
      )}
    </Stack>
  );
}

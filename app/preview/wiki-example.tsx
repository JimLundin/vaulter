import { applicationWikiGraph } from '@/application/composition.ts';
// Explicit preview adapter: fictional NodeStore -> production Wiki reader -> production record UI.
import { useEffect, useState } from 'react';
import { Button, Stack, Text } from '@/ui/kit/index.ts';
import { memoryNodeBackend } from '@/vault/nodes/memory.ts';
import type { NodeBackend } from '@/vault/nodes/store.ts';
import { retainedRecordSources } from '@/vault/records/sources.ts';
import { describeSource, type SourceReader } from '@/vault/sources.ts';
import { Wiki } from '@/workflows/wiki/index.tsx';
import { pageRoute } from '@/workflows/wiki/routes.ts';
import { useWikiReading, useWiki } from '@/workflows/wiki/use-wiki.ts';
import { seedPreviewRecords } from './records.ts';

const sources: SourceReader = {
  text: retainedRecordSources.text,
  describe: (node, view) => describeSource(node, view, [retainedRecordSources]),
};

export function WikiExample({ controls = false }: { controls?: boolean }) {
  const [nodes, setNodes] = useState<NodeBackend | null>(null);
  const [seedError, setSeedError] = useState('');
  const reading = useWikiReading(nodes, sources, applicationWikiGraph);
  const { pages, error: readError } = useWiki(reading);
  const error = seedError || readError;
  const [state, setState] = useState('page');
  const [selected, setSelected] = useState<string | undefined>('preview:page:0');
  useEffect(() => {
    const store = memoryNodeBackend();
    let active = true;
    void seedPreviewRecords(store)
      .then(() => {
        if (active) setNodes(store);
      })
      .catch((problem: unknown) => {
        if (active) setSeedError(String(problem));
      });
    return () => {
      active = false;
      store.close();
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
          {!!error && <Text tone="danger">{error}</Text>}
        </Stack>
      )}
    </Stack>
  );
}

import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '../ui/kit/styles.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenProduct, previewConversationKey } from '../product.tsx';
import { later } from '../ui/later.ts';
import { startTheme, Text, DesignPreview } from '../ui/kit/index.ts';
import { useWriter, applyOverlay } from '../vault/changes/writer.ts';
import { liveVault } from '../vault/index.ts';
import { memoryBackend } from '../vault/storage/memory.ts';
import { vaultRules } from '../vault/validation/rules.ts';
import type { Head } from '../vault/storage/backend.ts';
import { sampleFiles, note } from './data.ts';
import { previewModel } from './model.ts';
import { previewTranscription } from './transcription.ts';
import { previewNodes, previewJournalKey } from './nodes.ts';
import type { NodeStore } from '../vault/nodes/store.ts';

const memory = memoryBackend(sampleFiles);
const query = new URLSearchParams(location.search);
const openingNodes = previewNodes(sessionStorage, query.get('scenario') ?? undefined);
const initial = memory.backend.write!(
  [
    {
      path: 'Garden studio.md',
      text: note(
        'Garden studio',
        'A quiet place for making things. Leave the afternoons free for focused work.',
      ),
    },
  ],
  'Refine the garden studio note',
  async (base, after) => {
    const problems = await vaultRules.problems(base, after);
    if (problems.length) throw new Error(problems.join('\n'));
  },
);

function Preview({ initialHead, nodes }: { initialHead: Head; nodes: NodeStore }) {
  const [head, setHead] = useState(initialHead);
  const writer = useWriter(memory.backend, vaultRules, head, setHead);
  const current = useRef(writer);
  current.current = writer;
  const vault = useMemo(() => liveVault(() => current.current), []);
  useEffect(() => {
    if (query.has('legacy-staging'))
      later(
        vault.stage('Legacy draft.md', note('Legacy draft', 'An intentional pending file edit.')),
      );
  }, [vault]);
  const files = applyOverlay(head.files, writer.overlay);
  return (
    <DesignPreview
      label={`Design preview · ${(import.meta.env.VITE_PREVIEW_COMMIT || 'local').slice(0, 7)}`}
      onReset={() => {
        sessionStorage.removeItem(previewJournalKey);
        localStorage.removeItem(previewConversationKey);
        location.reload();
      }}
      kitHref={import.meta.env.DEV ? '/ui/kit/' : './kit/'}
    >
      <OpenProduct
        session={{
          vault,
          files,
          status: { kind: 'synced', at: Date.now() },
          locked: null,
          signOut: null,
          secrets: null,
          blocked: null,
          nodes,
          nodeStatus: { kind: 'synced', at: Date.now() },
        }}
        model={async () => previewModel}
        preview={{
          transcription: previewTranscription,
          suggestions: async () => [
            'How could I make more room for slow mornings?',
            'Help me plan an afternoon in the garden studio',
            'What themes connect the notes in my reading list?',
          ],
        }}
      />
    </DesignPreview>
  );
}

startTheme();
const root = createRoot(document.getElementById('app')!);
Promise.all([initial, openingNodes])
  .then(([{ head }, nodes]) => root.render(<Preview initialHead={head} nodes={nodes} />))
  .catch((error: unknown) => root.render(<Text tone="danger">{String(error)}</Text>));

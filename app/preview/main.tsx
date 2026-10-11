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
import type { NodeChange } from '../vault/nodes/store.ts';
import type { NodeStore } from '../vault/nodes/store.ts';

const memory = memoryBackend(sampleFiles);
const query = new URLSearchParams(location.search);
const openingNodes = previewNodes(sessionStorage, query.get('scenario') ?? undefined).then(
  async (nodes) => {
    if (query.has('conversations') && !(await nodes.snapshot()).get('preview:list-owner')) {
      await nodes.commit({
        id: 'preview:conversation-list',
        recordedBy: 'preview:list-owner',
        origin: null,
        undoOf: null,
        kind: { scope: 'node', action: 'create' },
        message: 'Sample conversations',
        changes: [
          {
            node: 'preview:list-owner',
            expected: null,
            placement: null,
            connection: null,
            data: { kind: 'actor', name: 'Preview owner' },
          },
          ...[
            'Garden studio plans',
            'A quiet week by the coast',
            'Keeping mornings free for focused work',
            'Books and ideas to return to',
            'Dinner with the neighbours',
            'A longer conversation title about making space for the things that matter',
          ].flatMap((title, index): NodeChange[] => {
            const node = `preview:chat:${index}`;
            const at = new Date(Date.UTC(2026, 9, 11 - index * 2, 9, 30)).toISOString();
            return [
              {
                node,
                expected: null,
                placement: null,
                connection: null,
                data: { kind: 'conversation', title, createdAt: at },
              },
              {
                node: `${node}:exchange`,
                expected: null,
                placement: { parent: node, order: 'a' },
                connection: null,
                data: { kind: 'exchange', startedAt: at },
              },
              {
                node: `${node}:message`,
                expected: null,
                placement: { parent: `${node}:exchange`, order: 'a' },
                connection: null,
                data: { kind: 'message', role: 'user', at, text: title },
              },
            ];
          }),
        ],
      });
    }
    return nodes;
  },
);
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
      variants={{
        label: 'Conversation variant',
        target: 'chat.conversation-list',
        parameter: 'conversations',
        defaultValue: 'rule',
        options: [
          { value: 'rule', label: 'Tight · strong rule' },
          { value: 'band', label: 'Tight · shaded header' },
          { value: 'editorial', label: 'Tight · editorial header' },
        ],
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
          refreshNodes: async () => undefined,
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

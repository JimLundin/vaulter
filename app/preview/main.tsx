import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '../ui/kit/styles.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenProduct } from '../product.tsx';
import { later } from '../ui/later.ts';
import {
  startTheme,
  Text,
  DesignPreview,
  DesignComparison,
  type CompactNavigationDesign,
} from '../ui/kit/index.ts';
import { useWriter, applyOverlay } from '../vault/changes/writer.ts';
import { liveVault } from '../vault/index.ts';
import { memoryBackend } from '../vault/storage/memory.ts';
import { vaultRules } from '../vault/validation/rules.ts';
import type { Head } from '../vault/storage/backend.ts';
import { sampleFiles, note } from './data.ts';
import { previewModel } from './model.ts';
import { createOpenAICapabilities } from '../agent/openai/index.ts';
import { recordedTranscription } from '../agent/recorded-transcription.ts';
import { previewTranscription } from './transcription.ts';
import { previewNodes, previewJournalKey } from './nodes.ts';
import type { NodeChange } from '../vault/nodes/store.ts';
import type { NodeStore } from '../vault/nodes/store.ts';
import { seedPreviewRecords } from './records.ts';

// Old evidence design links remain preview-only redirects to the supported Wiki record.
if (location.hash === '#/prototype/provenance/')
  history.replaceState(
    history.state,
    '',
    `${location.pathname}${location.search}#/wiki/preview:page:0/`,
  );
const memory = memoryBackend(sampleFiles);
const query = new URLSearchParams(location.search);
declare const __PREVIEW_AGENT__: {
  baseURL: string;
  defaultModel?: string;
  transcriptionModel: string;
} | null;
const liveAgent = import.meta.env.DEV && query.get('agent') === 'live';
const agentConnection = __PREVIEW_AGENT__;
const agent =
  liveAgent && agentConnection
    ? createOpenAICapabilities({
        apiKey: 'local-preview',
        baseURL: new URL(agentConnection.baseURL, location.origin).href,
        models: { fileTranscription: agentConnection.transcriptionModel },
      })
    : null;
const transcription = agent ? recordedTranscription(agent.transcribe) : previewTranscription;
const openingNodes = previewNodes(sessionStorage, query.get('scenario') ?? undefined).then(
  async (nodes) => {
    await seedPreviewRecords(nodes);
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
    // Update retained fictional samples too, so existing local previews get same-day groups.
    if (
      query.has('conversations') &&
      !(await nodes.history()).some((transaction) => transaction.id === 'preview:same-day-groups')
    ) {
      const snapshot = await nodes.snapshot();
      const changes: NodeChange[] = [];
      for (let index = 0; index < 6; index++) {
        const node = `preview:chat:${index}`;
        const at = new Date(
          Date.UTC(2026, 9, index < 3 ? 11 : index < 5 ? 10 : 8, 16 - (index % 3) * 3, 30),
        ).toISOString();
        for (const [id, fields] of [
          [node, { createdAt: at }],
          [`${node}:exchange`, { startedAt: at }],
          [`${node}:message`, { at }],
        ] as const) {
          const before = snapshot.get(id);
          if (before?.data)
            changes.push({
              node: id,
              expected: before.key.transaction,
              placement: before.placement,
              connection: before.connection,
              data: { ...before.data, ...fields },
            });
        }
      }
      if (changes.length)
        await nodes.commit({
          id: 'preview:same-day-groups',
          recordedBy: 'preview:list-owner',
          origin: null,
          undoOf: null,
          kind: { scope: 'node', action: 'update' },
          message: 'Group fictional conversations on the same day',
          changes,
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
  const product = (compactNavigation?: CompactNavigationDesign) => (
    <OpenProduct
      compactNavigation={compactNavigation}
      session={{
        vault,
        files,
        status: { kind: 'synced', at: Date.now() },
        locked: null,
        signOut: null,
        secrets: null,
        preloadedSecrets: null,
        secretOverrides: {},
        updateSecret: async () => {
          throw new Error('Credentials are supplied by the preview server.');
        },
        blocked: null,
        nodes,
        nodeStatus: { kind: 'synced', at: Date.now() },
        refreshNodes: async () => undefined,
      }}
      model={agent?.model ?? (async () => previewModel)}
      preview={{
        provider: agent ? 'openai' : 'preview',
        defaultModel: agent ? agentConnection?.defaultModel : undefined,
        transcription,
        suggestions: async () => [
          'How could I make more room for slow mornings?',
          'Help me plan an afternoon in the garden studio',
          'What themes connect the notes in my reading list?',
        ],
      }}
    />
  );
  const frame = (content: React.ReactNode, controls?: React.ReactNode) => (
    <DesignPreview
      label={`${query.get('navigation') === 'prototype' ? 'Mobile navigation prototype' : agent ? 'Live agent preview' : 'Design preview'} · ${(import.meta.env.VITE_PREVIEW_COMMIT || 'local').slice(0, 7)}`}
      chat={agent ? 'Live agent' : 'Scripted chat'}
      onReset={() => {
        sessionStorage.removeItem(previewJournalKey);
        location.hash = '#/chat/';
        location.reload();
      }}
      kitHref={import.meta.env.DEV ? '/ui/kit/' : './kit/'}
      variantControls={controls}
    >
      {content}
    </DesignPreview>
  );
  if (query.get('navigation') !== 'prototype') return frame(product());
  // Three mobile navigation prototypes in the actual Product. The neutral preview stays current.
  return (
    <DesignComparison
      defaultValue={query.get('variant') ?? 'slim'}
      onValueChange={(value) => {
        const url = new URL(location.href);
        url.searchParams.set('variant', value);
        history.replaceState(history.state, '', url);
      }}
      alternatives={[
        { id: 'current', label: 'Current bar', content: product() },
        { id: 'slim', label: 'Slim tabs', content: product('slim') },
        { id: 'dock', label: 'Floating dock', content: product('dock') },
        { id: 'header', label: 'Header menu', content: product('header') },
      ]}
      preview={(controls, content) => frame(content, controls)}
    />
  );
}

startTheme();
const root = createRoot(document.getElementById('app')!);
Promise.all([initial, openingNodes])
  .then(([{ head }, nodes]) =>
    root.render(
      liveAgent && !agent ? (
        <Text tone="danger">
          Live agent preview needs VAULT_OPENAI_KEY (or OPENAI_API_KEY / FOUNDRY_TOKEN) on the
          development server. Set VAULT_OPENAI_API for a custom endpoint, then restart Vite.
        </Text>
      ) : (
        <Preview initialHead={head} nodes={nodes} />
      ),
    ),
  )
  .catch((error: unknown) => root.render(<Text tone="danger">{String(error)}</Text>));

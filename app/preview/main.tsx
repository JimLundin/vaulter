import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '../ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { OpenApplication } from '../application/index.tsx';
import { applicationNodes } from '../application/composition.ts';
import { startTheme, Text, DesignPreview, DesignComparison } from '../ui/kit/index.ts';
import { GraphPrototype, graphDesigns } from './prototype-graph.tsx';
import { seedGraphEvidence } from './graph-evidence.ts';
import { seedGraphDensity } from './graph-density.ts';
import { previewModel } from './model.ts';
import { createOpenAICapabilities } from '../agent/openai/index.ts';
import { recordedTranscription } from '../agent/recorded-transcription.ts';
import { previewTranscription } from './transcription.ts';
import { previewNodes, previewJournalKey } from './nodes.ts';
import type { NodeChange } from '../vault/nodes/store.ts';
import type { NodeStore } from '../vault/nodes/store.ts';
import { seedPreviewRecords } from './records.ts';

const query = new URLSearchParams(location.search);
declare const __PREVIEW_AGENT__: {
  baseURL: string;
  defaultModel?: string;
  transcriptionModel: string;
} | null;
const liveAgent =
  (import.meta.env.DEV || import.meta.env.MODE === 'browser-test') && query.get('agent') === 'live';
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
    if (query.get('compare') === 'graph') {
      await seedGraphEvidence(nodes);
      await seedGraphDensity(nodes);
      if (!(await nodes.snapshot()).get('preview:inquiry:studio-context:0')) {
        await nodes.commit({
          id: 'preview:inquiry:studio-context',
          recordedBy: 'preview:wiki-owner',
          origin: null,
          undoOf: null,
          kind: { scope: 'node', action: 'create' },
          message: 'Fictional context for open Studio questions',
          changes: [0, 1].map((index) => ({
            node: `preview:inquiry:studio-context:${index}`,
            expected: null,
            data: { kind: 'relationship', predicate: 'informed-by' },
            placement: { parent: `preview:density:studio-question:${index}`, order: 'a' },
            connection: {
              source: { node: `preview:density:studio-question:${index}` },
              target: { node: `preview:graph-claim:${index}` },
            },
          })),
        });
      }
    }
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
function Preview({ nodes }: { nodes: NodeStore }) {
  const product = (design?: string) => (
    <OpenApplication
      renderGraph={design ? (props) => <GraphPrototype {...props} design={design} /> : undefined}
      session={{
        ready: true,
        locked: null,
        signOut: null,
        secrets: null,
        preloadedSecrets: null,
        secretOverrides: {},
        updateSecret: async () => {
          throw new Error('Credentials are supplied by the preview server.');
        },
        nodes: applicationNodes(nodes),
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
  if (query.get('compare') === 'graph')
    return (
      <DesignComparison
        defaultValue={query.get('variant') ?? 'topic-middle'}
        onValueChange={(variant) => {
          const url = new URL(location.href);
          url.searchParams.set('variant', variant);
          history.replaceState(history.state, '', url);
        }}
        alternatives={[
          { ...graphDesigns[0], content: product(graphDesigns[0].id) },
          { ...graphDesigns[1], content: product(graphDesigns[1].id) },
          { ...graphDesigns[2], content: product(graphDesigns[2].id) },
        ]}
        preview={(controls, content) => (
          <DesignPreview
            label="Graph design comparison"
            variantControls={controls}
            kitHref={import.meta.env.DEV ? '/ui/kit/' : './kit/'}
            onReset={() => {
              sessionStorage.removeItem(previewJournalKey);
              location.reload();
            }}
          >
            {content}
          </DesignPreview>
        )}
      />
    );
  return (
    <DesignPreview
      label={`${agent ? 'Live agent preview' : 'Design preview'} · ${(import.meta.env.VITE_PREVIEW_COMMIT || 'local').slice(0, 7)}`}
      chat={agent ? 'Live agent' : 'Scripted chat'}
      onReset={() => {
        sessionStorage.removeItem(previewJournalKey);
        location.hash = '#/chat/';
        location.reload();
      }}
      kitHref={import.meta.env.DEV ? '/ui/kit/' : './kit/'}
    >
      {product()}
    </DesignPreview>
  );
}

startTheme();
const root = createRoot(document.getElementById('app')!);
openingNodes
  .then((nodes) =>
    root.render(
      liveAgent && !agent ? (
        <Text tone="danger">
          Live agent preview needs VAULT_OPENAI_KEY (or OPENAI_API_KEY / FOUNDRY_TOKEN) on the
          development server. Set VAULT_OPENAI_API for a custom endpoint, then restart Vite.
        </Text>
      ) : (
        <Preview nodes={nodes} />
      ),
    ),
  )
  .catch((error: unknown) => root.render(<Text tone="danger">{String(error)}</Text>));

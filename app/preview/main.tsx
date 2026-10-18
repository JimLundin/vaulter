import { seedEavQuestions } from './question-records.ts';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '@/ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { DesignComparison } from '@/ui/kit/index.ts';
import { OpenApplication } from '@/application/index.tsx';
import { applicationWiki } from '@/application/composition.ts';
import { startTheme, Text, DesignPreview, Gate, Brand, Button, Stack } from '@/ui/kit/index.ts';
import { seedGraphEvidence } from './graph-evidence.ts';
import { seedGraphDensity } from './graph-density.ts';
import { previewModel } from './model.ts';
import { createOpenAICapabilities } from '@/agent/openai/index.ts';
import { recordedTranscription } from '@/agent/recorded-transcription.ts';
import { previewTranscription } from './transcription.ts';
import { previewEav, previewEavKey } from './eav.ts';
import { seedEavWiki } from './wiki-records.ts';
import { seedMap } from './map-records.ts';
import { seedCalendar } from './calendar-records.ts';
import { seedConversation } from './conversation-records.ts';

const query = new URLSearchParams(location.search);
const eav = previewEav(sessionStorage, query.get('scenario') ?? undefined);
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
const opening = (async () => {
  const db = await applicationWiki(eav).database();
  await seedEavWiki(db);
  await seedCalendar(eav);
  await seedMap(eav);
  await seedEavQuestions(db);
  await seedGraphEvidence(db, query.get('compare') === 'graph');
  if (query.get('compare') === 'graph') await seedGraphDensity(db);
  if (query.has('conversations')) await seedConversation(db);
})();
function Preview() {
  const [signedOut, setSignedOut] = useState(false);
  const [settingsVariant, setSettingsVariant] = useState<'cards' | 'compact'>(
    query.get('variant') === 'compact' ? 'compact' : 'cards',
  );
  const product = () => (
    <OpenApplication
      session={{
        ready: true,
        eav,
        locked: null,
        signOut: async () => setSignedOut(true),
        secrets: null,
        preloadedSecrets: null,
        secretOverrides: {},
        updateSecret: () =>
          Promise.reject(new Error('Credentials are supplied by the preview server.')),
        status: { kind: 'synced', at: Date.now() },
        refresh: async () => undefined,
      }}
      model={agent?.model ?? (async () => previewModel)}
      preview={{
        settingsVariant,
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
  const frame = (content: React.ReactNode, variantControls?: React.ReactNode) => (
    <DesignPreview
      variantControls={variantControls}
      label={`${agent ? 'Live agent preview' : 'Design preview'} · ${(import.meta.env.VITE_PREVIEW_COMMIT || 'local').slice(0, 7)}`}
      chat={agent ? 'Live agent' : 'Scripted chat'}
      onReset={() => {
        sessionStorage.removeItem(previewEavKey);
        location.hash = '#/chat/';
        location.reload();
      }}
      kitHref={import.meta.env.DEV ? '/ui/kit/' : './kit/'}
    >
      {signedOut ? (
        <Gate>
          <Brand />
          <Stack>
            <Text>Preview signed out. Your demo records are still here.</Text>
            <Button onClick={() => setSignedOut(false)}>Open demo vault</Button>
          </Stack>
        </Gate>
      ) : (
        content
      )}
    </DesignPreview>
  );
  if (query.get('compare') === 'settings')
    return (
      <DesignComparison
        defaultValue={settingsVariant}
        alternatives={[
          { id: 'cards', label: 'Grouped cards', content: null },
          { id: 'compact', label: 'Grouped cards · compact', content: null },
        ]}
        onValueChange={(value) => {
          setSettingsVariant(value === 'compact' ? 'compact' : 'cards');
          const url = new URL(location.href);
          url.searchParams.set('variant', value);
          history.replaceState(null, '', url);
        }}
        preview={(controls) => frame(product(), controls)}
      />
    );
  return frame(product());
}

startTheme();
const root = createRoot(document.getElementById('app')!);
opening
  .then(() =>
    root.render(
      liveAgent && !agent ? (
        <Text tone="danger">
          Live agent preview needs VAULT_OPENAI_KEY (or OPENAI_API_KEY / FOUNDRY_TOKEN) on the
          development server. Set VAULT_OPENAI_API for a custom endpoint, then restart Vite.
        </Text>
      ) : (
        <Preview />
      ),
    ),
  )
  .catch((error: unknown) => root.render(<Text tone="danger">{String(error)}</Text>));

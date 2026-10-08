// The product's explicit assembly. Only this file imports optional workflows.
import { useEffect, useMemo, useState } from 'react';
import type { LanguageModel } from 'ai';
import {
  useVaultSession,
  noteSearchIndex,
  notesOf,
  titleOf,
  type OpenBackend,
  type OwnedVault,
} from './vault/index.ts';
import { Frame } from './ui/Frame.tsx';
import { Unlock } from './ui/Unlock.tsx';
import { Search, Keys } from './ui/Search.tsx';
import { Previews } from './ui/Previews.tsx';
import { useKeys } from './ui/keys.ts';
import { opened } from './ui/recent.ts';
import { go, link, pattern, useRoute } from './ui/routing.ts';
import { later } from './ui/later.ts';
import {
  Alert,
  AlertDescription,
  Button,
  Gate,
  Heading,
  Icon,
  Link,
  Overlay,
  Page,
  PreviewBar,
  SettingsPage,
  SettingsSection,
  SettingField,
  VoiceButton,
  MobileActionButton,
  Row,
  Stack,
  Text,
  ThemeSwitch,
  setTheme,
  useIsMobile,
} from './ui/kit/index.ts';
import type { Command, Navigation } from './ui/command.ts';
import {
  ChatPage,
  ChatPanel,
  ChatIndicator,
  ChatSettings,
  openAITranscription,
  useTranscription,
  useTranscript,
  type TranscriptionProvider,
  useConversation,
  useChat,
  openAIModel,
  type Prompt,
} from './workflows/chat/index.tsx';
import { HistoryPage } from './workflows/history/index.tsx';
import './workflows/chat/rendering/prose.css';

const agentRoute = pattern('/agent/');
const historyRoute = pattern('/history/');
const settingsRoute = pattern('/settings/');
const renameTools = async (vault: OwnedVault) =>
  (await import('./workflows/rename-note/agent.ts')).renameTools(vault);

export function Product({ openBackend }: { openBackend: OpenBackend }) {
  const session = useVaultSession(openBackend);
  if (session.locked) return <Unlock unlock={session.locked.unlock} />;
  if (!session.files || session.blocked)
    return (
      <Gate>
        {session.blocked || session.status.kind === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>
              {session.blocked ?? (session.status.kind === 'error' ? session.status.message : '')}
            </AlertDescription>
          </Alert>
        ) : (
          <Text tone="subtle">Opening the vault…</Text>
        )}
      </Gate>
    );
  return <OpenProduct session={session} />;
}

/** The same product views with supplied session/model adapters, including the design preview. */
export function OpenProduct({
  session,
  model: suppliedModel,
  preview,
}: {
  session: ReturnType<typeof useVaultSession>;
  model?: (name: string) => Promise<LanguageModel>;
  preview?: {
    label: string;
    reset: () => void;
    kitHref?: string;
    suggestions: () => Promise<string[]>;
    transcription: TranscriptionProvider;
  };
}) {
  const { vault, files, status } = session;
  const route = useRoute();
  const mobile = useIsMobile();
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [panel, setPanel] = useState(
    () =>
      matchMedia('(min-width: 1280px)').matches && localStorage.getItem('vault-panel') === 'agent',
  );
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const showPanel = (open: boolean) => {
    setPanel(open);
    if (open) localStorage.setItem('vault-panel', 'agent');
    else localStorage.removeItem('vault-panel');
  };
  const onAgent = route.path === '/' || !!agentRoute.match(route.path);
  const onHistory = !!historyRoute.match(route.path);
  const onSettings = !!settingsRoute.match(route.path);
  const title = onAgent ? 'Agent' : onHistory ? 'History' : onSettings ? 'Settings' : 'Not found';
  const remoteModel = useMemo(
    () =>
      session.secrets?.openai
        ? openAIModel(session.secrets.openai, import.meta.env.VITE_OPENAI_API || undefined)
        : null,
    [session.secrets?.openai],
  );
  const speechProvider = useMemo(
    () =>
      session.secrets?.openai
        ? openAITranscription(session.secrets.openai, import.meta.env.VITE_OPENAI_API || undefined)
        : null,
    [session.secrets?.openai],
  );
  const voice = useTranscription(preview?.transcription ?? speechProvider);
  const transcript = useTranscript(voice);
  const note = files ? notesOf(files).byHref.get(route.path) : undefined;
  const conversation = useConversation({
    vault,
    model: suppliedModel ?? remoteModel,
    tools: renameTools,
    collect: preview ? async () => ({ groups: {} }) : undefined,
    suggestions: preview?.suggestions,
    page: note ? { title: titleOf(note), path: note.path } : onAgent ? undefined : { title },
  });
  const { busy: agentBusy } = useChat(conversation);
  const navigation: Navigation[] = [
    { label: 'Agent', href: agentRoute.href(), icon: 'sparkles' },
    ...(vault.history
      ? [{ label: 'History', href: historyRoute.href(), icon: 'history' as const }]
      : []),
    { label: 'Settings', href: settingsRoute.href(), icon: 'settings' },
  ];
  const index = useMemo(() => noteSearchIndex(files!), [files]);
  const ask = (text?: string) => {
    if (text) setPrompt((current) => ({ text, send: true, n: (current?.n ?? 0) + 1 }));
    showPanel(true);
  };
  const voiceAction = () => {
    if (transcript.phase === 'connecting') {
      voice.clear();
      return;
    }
    if (conversation.chat.state.busy) {
      conversation.stop();
      return;
    }
    if (transcript.phase === 'listening') {
      if (mobile) {
        showPanel(false);
        go(agentRoute.href());
      }
      later(voice.finish());
      return;
    }
    if (transcript.phase === 'ready') {
      const { text } = transcript;
      voice.clear();
      setPrompt((current) => ({ text, send: true, n: (current?.n ?? 0) + 1 }));
      if (mobile) {
        showPanel(false);
        go(agentRoute.href());
      } else showPanel(true);
      return;
    }
    if (mobile) {
      showPanel(false);
      go(agentRoute.href());
    }
    later(voice.start());
  };
  const commands: Command[] = [
    {
      id: 'go.agent',
      label: 'Agent',
      group: 'Go to',
      icon: 'sparkles',
      keys: 'g h',
      run: () => go(agentRoute.href()),
    },
    ...(vault.history
      ? [
          {
            id: 'go.history',
            label: 'History',
            group: 'Go to',
            icon: 'history' as const,
            keys: 'g y',
            run: () => go(historyRoute.href()),
          },
        ]
      : []),
    {
      id: 'go.settings',
      label: 'Settings',
      group: 'Go to',
      icon: 'settings',
      run: () => go(settingsRoute.href()),
    },
    {
      id: 'agent.ask',
      label: 'Ask the agent',
      group: 'Agent',
      icon: 'sparkles',
      keys: 'mod+j',
      run: () => showPanel(!panel),
    },
    ...(conversation.chat.state.turns.length && !conversation.chat.state.busy
      ? [
          {
            id: 'agent.new',
            label: 'New chat',
            group: 'Agent',
            icon: 'plus' as const,
            run: () => {
              conversation.newChat();
              ask();
            },
          },
        ]
      : []),
    {
      id: 'search',
      label: 'Search',
      group: 'Actions',
      keys: 'mod+k',
      hidden: true,
      run: () => setSearch(true),
    },
    {
      id: 'search.slash',
      label: 'Search',
      group: 'Actions',
      keys: '/',
      hidden: true,
      run: () => setSearch(true),
    },
    {
      id: 'help',
      label: 'Keyboard shortcuts',
      group: 'Actions',
      icon: 'keyboard',
      keys: '?',
      run: () => setHelp(true),
    },
    { id: 'theme.light', label: 'Light theme', group: 'Theme', run: () => setTheme('light') },
    { id: 'theme.dark', label: 'Dark theme', group: 'Theme', run: () => setTheme('dark') },
    { id: 'theme.system', label: 'System theme', group: 'Theme', run: () => setTheme('system') },
    ...(session.signOut
      ? [
          {
            id: 'signout',
            label: 'Sign out',
            group: 'Actions',
            run: () => {
              voice.dispose();
              conversation.dispose();
              later(session.signOut!());
            },
          },
        ]
      : []),
  ];
  useKeys(
    commands.flatMap((command) => (command.keys ? [{ keys: command.keys, run: command.run }] : [])),
  );
  useEffect(() => {
    document.title = `${title} · Vault`;
  }, [title]);
  useEffect(() => {
    if (index.has(route.path)) opened(route.path);
  }, [route.path, index]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the scrolling content on page changes too
  useEffect(() => {
    const element = route.anchor && document.getElementById(route.anchor);
    if (element) element.scrollIntoView();
    else document.querySelector('[data-region=""]')?.scrollTo(0, 0);
  }, [route.path, route.anchor]);
  const statusLabel =
    status.kind === 'synced'
      ? `Synced ${new Date(status.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : status.kind === 'error'
        ? status.message
        : status.kind === 'offline'
          ? 'Offline'
          : 'Syncing…';
  const historyHref = vault.history ? historyRoute.href() : undefined;
  return (
    <>
      <Frame
        navigation={navigation}
        status={statusLabel}
        failed={status.kind === 'error' || status.kind === 'offline'}
        signOut={
          session.signOut
            ? async () => {
                voice.dispose();
                conversation.dispose();
                await session.signOut!();
              }
            : null
        }
        onSearch={() => setSearch(true)}
        actions={
          <Button
            variant={panel ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={panel}
            onClick={() => showPanel(!panel)}
          >
            <Icon name="sparkles" />
            {preview ? 'Try a conversation' : 'Ask the agent'}
            <ChatIndicator conversation={conversation} />
          </Button>
        }
        mobileNavigation={
          <MobileActionButton icon="sparkles" label="Agent" onClick={() => go(agentRoute.href())} />
        }
        mobileAction={
          <VoiceButton phase={transcript.phase} busy={agentBusy} onClick={voiceAction} />
        }
        panel={
          panel ? (
            <ChatPanel
              conversation={conversation}
              prompt={prompt}
              historyHref={historyHref}
              voice={voice}
              previewVoice={!!preview}
            />
          ) : null
        }
        closePanel={() => showPanel(false)}
      >
        {!!preview && (
          <PreviewBar
            label={preview.label}
            kitHref={preview.kitHref ?? './kit/'}
            onReset={preview.reset}
          />
        )}
        {onAgent ? (
          <ChatPage
            conversation={conversation}
            prompt={prompt}
            historyHref={historyHref}
            voice={voice}
            previewVoice={!!preview}
          />
        ) : onHistory ? (
          <HistoryPage vault={vault} />
        ) : onSettings ? (
          <SettingsPage>
            <SettingsSection title="Appearance">
              <SettingField
                label="Theme"
                description="Choose a theme, or follow your device's appearance."
              >
                <ThemeSwitch />
              </SettingField>
            </SettingsSection>
            <ChatSettings />
          </SettingsPage>
        ) : (
          <Page>
            <Heading level={1}>Not found</Heading>
            <Text>Nothing at {route.path}.</Text>
            <Link href={link(agentRoute.href())}>Open the agent</Link>
          </Page>
        )}
      </Frame>
      <Search commands={commands} index={index} open={search} setSearch={setSearch} onAsk={ask} />
      <Previews index={index} />
      <Overlay
        mobile={mobile}
        open={help}
        onClose={() => setHelp(false)}
        title="Keyboard shortcuts"
        description="Plain keys work when you aren't typing."
      >
        <Stack>
          {commands
            .filter((command) => command.keys)
            .map((command) => (
              <Row key={command.id} justify="between">
                <Text size="sm">{command.label}</Text>
                <Keys keys={command.keys!} />
              </Row>
            ))}
        </Stack>
      </Overlay>
    </>
  );
}

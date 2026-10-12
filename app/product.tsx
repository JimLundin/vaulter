// The product's explicit assembly. Only this file imports optional workflows.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LanguageModel } from 'ai';
import {
  useVaultSession,
  noteSearchIndex,
  type OpenBackend,
  type OpenNodes,
} from './vault/index.ts';
import { Frame } from './ui/Frame.tsx';
import { Unlock } from './ui/Unlock.tsx';
import { Search, Keys } from './ui/Search.tsx';
import { Previews } from './ui/Previews.tsx';
import { useKeys } from './ui/keys.ts';
import { opened } from './ui/recent.ts';
import { go, link, parseRoute, pattern, useRoute } from './ui/routing.ts';
import { later } from './ui/later.ts';
import {
  Button,
  Brand,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Alert,
  AlertDescription,
  Gate,
  Heading,
  Link,
  Loader,
  Overlay,
  Page,
  SettingsMenu,
  SettingsSection,
  SettingField,
  VoiceButton,
  Row,
  Stack,
  Text,
  ThemeSwitch,
  setTheme,
  useLayout,
} from './ui/kit/index.ts';
import type { Command, Navigation } from './ui/command.ts';
import {
  ChatPage,
  ChatPanel,
  ChatSettings,
  useTranscription,
  type TranscriptionProvider,
  useConversation,
  useChat,
  type Prompt,
} from './workflows/chat/index.tsx';
import {
  createApplicationIdentities,
  defaultIdentities,
  type ApplicationIdentities,
} from './application-identities.ts';
import { nodeContentTools, canUndoContent } from './vault/content/tools.ts';
import type { NodeDifference, NodeStore } from './vault/nodes/store.ts';
import { createOpenAICapabilities } from './agent/openai/index.ts';
import { model as selectedModel } from './workflows/chat/model.ts';
import { preservesAgentRecords } from './agent/preservation.ts';
import { agentSources } from './agent/sources.ts';
import { preservesChatRecords } from './workflows/chat/records/chat.ts';
import { chatSources } from './workflows/chat/records/sources.ts';
import { contentSources } from './vault/content/sources.ts';
import { retainedRecordSources } from './vault/records/sources.ts';
import { describeSource, type SourceReader } from './vault/sources.ts';
import {
  createNodeConversation,
  type NodeConversationOptions,
} from './workflows/chat/node-conversation.ts';
import {
  nodeHistory,
  prepareContentUndo,
  type NodeHistoryEntry,
} from './workflows/history/nodes.ts';
import { HistoryPage } from './workflows/history/index.tsx';
import { Wiki, type ForeignRecordRenderer } from './workflows/wiki/index.tsx';
import { wikiRoute, pageRoute } from './workflows/wiki/routes.ts';
import { useWikiReading, useWiki } from './workflows/wiki/use-wiki.ts';
import { QuestionItem } from './workflows/questions/QuestionItem.tsx';
import { questionSources } from './workflows/questions/sources.ts';
import { useQuestions, useQuestionsReading } from './workflows/questions/use-questions.ts';

const chatRoute = pattern('/chat/');
const conversationRoute = pattern('/chat/:node/');
const legacyChatRoute = pattern('/agent/');
const historyRoute = pattern('/history/');
const settingsRoute = pattern('/settings/');
const unavailableNodes: NodeStore = {
  commit: () => Promise.reject(new Error('Node store is unavailable.')),
  snapshot: () => Promise.reject(new Error('Node store is unavailable.')),
  history: async () => [],
  changes: async () => [],
  subscribe: () => () => undefined,
};
const unavailableModel = () =>
  Promise.reject(new Error('Configure an OpenAI key to send messages.'));
const chatSettings = { maxSteps: 12 };
const contentKinds = ['content'];
const enabledContentTools = [{ name: 'createNode' }, { name: 'readNode' }, { name: 'updateNode' }];
const productionConversationKey = `vaulter:conversation:${import.meta.env.VITE_GITHUB_API || 'https://api.github.com'}:${import.meta.env.VITE_VAULT_REPO || 'JimLundin/vault@main'}`;
export const previewConversationKey = 'vaulter:preview:conversation:v1';

export function Product({
  openBackend,
  openNodes,
  identities,
}: {
  openBackend: OpenBackend;
  openNodes?: OpenNodes;
  identities?: ApplicationIdentities;
}) {
  const session = useVaultSession(openBackend, openNodes);
  if (session.locked) return <Unlock unlock={session.locked.unlock} />;
  if (!session.files || session.blocked)
    return (
      <Gate>
        <Brand />
        {session.blocked || session.status.kind === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>
              {session.blocked ?? (session.status.kind === 'error' ? session.status.message : '')}
            </AlertDescription>
          </Alert>
        ) : (
          <Card>
            <CardHeader>
              <Heading level={1}>Opening your vault</Heading>
              <CardDescription>Getting your conversations and notes ready.</CardDescription>
            </CardHeader>
            <CardContent>
              <Loader>Loading your vault…</Loader>
            </CardContent>
          </Card>
        )}
      </Gate>
    );
  return <OpenProduct session={session} identities={identities} />;
}

/** The same product views with supplied session/model adapters, including the design preview. */
export function OpenProduct({
  session,
  model: suppliedModel,
  preview,
  identities = defaultIdentities,
}: {
  session: ReturnType<typeof useVaultSession>;
  model?: (name: string) => Promise<LanguageModel>;
  identities?: ApplicationIdentities;
  preview?: {
    provider?: string;
    defaultModel?: string;
    suggestions: () => Promise<string[]>;
    transcription: TranscriptionProvider;
  };
}) {
  const { vault, files, status, nodes, nodeStatus } = session;
  const conversationKey = preview ? previewConversationKey : productionConversationKey;
  const selectionStorage = preview ? sessionStorage : localStorage;
  const setup = useMemo(
    () => (nodes ? createApplicationIdentities(nodes, identities) : null),
    [nodes, identities],
  );
  const nodeHistoryView = useMemo(
    () => (nodes ? productNodeHistory(nodes, identities) : undefined),
    [nodes, identities],
  );
  const [identityState, setIdentityState] = useState<{
    owner: typeof setup;
    ready: boolean;
    error?: string;
  }>({ owner: null, ready: false });
  const prepareIdentities = useCallback(async () => {
    if (!setup) return;
    setIdentityState({ owner: setup, ready: false });
    try {
      await setup.ensure();
      setIdentityState({ owner: setup, ready: true });
    } catch (error) {
      setIdentityState({
        owner: setup,
        ready: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [setup]);
  useEffect(() => {
    if (nodeStatus.kind === 'synced') later(prepareIdentities());
  }, [prepareIdentities, nodeStatus.kind]);
  const retainedConversation = useMemo(
    () => selectionStorage.getItem(conversationKey) ?? undefined,
    [conversationKey, selectionStorage],
  );
  const route = useRoute();
  const wikiSources = useMemo<SourceReader>(() => {
    const chat = chatSources((node) => `#${conversationRoute.href({ node })}`);
    const owners = [chat, contentSources, questionSources, retainedRecordSources, agentSources];
    return {
      text: (node, context) =>
        chat.text(node, context) ??
        contentSources.text(node, context) ??
        questionSources.text(node, context) ??
        retainedRecordSources.text(node, context) ??
        agentSources.text(node, context),
      describe: (node, view) => describeSource(node, view, owners),
    };
  }, []);
  const wiki = useWikiReading(nodes, wikiSources);
  const { pages, error: wikiError } = useWiki(wiki);
  const wikiPage = pageRoute.match(route.path)?.node;
  const onWiki = !!wikiRoute.match(route.path) || !!wikiPage;
  const questions = useQuestionsReading(onWiki ? nodes : null);
  const questionState = useQuestions(questions);
  const questionIndex = useMemo(
    () => new Map(questionState.questions?.map((question) => [question.id, question])),
    [questionState.questions],
  );
  const renderWikiRecord: ForeignRecordRenderer = (block) => {
    if (block.data.kind !== 'question') return;
    const question = questionIndex.get(block.id);
    if (!question)
      return (
        <Stack gap="xs">
          <Text>{String(block.data.text ?? '')}</Text>
          <Text tone="muted" size="sm">
            {questionState.error
              ? `Question details unavailable: ${questionState.error}`
              : 'Loading question details…'}
          </Text>
        </Stack>
      );
    return (
      <Stack gap="xs">
        {!!questionState.error && (
          <Text role="status" tone="muted" size="sm">
            Question details could not refresh; showing the last recorded status.{' '}
            {questionState.error}
          </Text>
        )}
        <QuestionItem
          question={question}
          describeTarget={(target) => {
            if (!(target.version && questionState.view)) return;
            const description = wikiSources.describe(target.version, questionState.view);
            if (description)
              return {
                ...description,
                navigationLabel: description.href
                  ? `Open source context${description.title ? `: ${description.title}` : ''}`
                  : undefined,
              };
            const seen = new Set<string>();
            let current = target.version;
            while (current.data && !seen.has(current.key.node)) {
              seen.add(current.key.node);
              if (current.data.kind === 'page')
                return {
                  title: String(current.data.title ?? 'Wiki answer'),
                  href: `#${pageRoute.href({ node: current.key.node })}`,
                  navigationLabel: `Open Wiki page: ${String(current.data.title ?? 'Wiki answer')}`,
                };
              if (!current.placement) break;
              const parent = questionState.view.get(current.placement.parent);
              if (!parent?.data) break;
              current = parent;
            }
          }}
        />
      </Stack>
    );
  };
  const layout = useLayout();
  const mobile = layout === 'compact';
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const [settings, setSettings] = useState(false);
  const [panel, setPanel] = useState(
    () => layout === 'wide' && localStorage.getItem('vault-panel') === 'agent',
  );
  const showPanel = (open: boolean) => {
    setPanel(open);
    if (open) localStorage.setItem('vault-panel', 'agent');
    else localStorage.removeItem('vault-panel');
  };
  const onSettings = !!settingsRoute.match(route.path);
  const onChat =
    route.path === '/' ||
    !!chatRoute.match(route.path) ||
    !!conversationRoute.match(route.path) ||
    !!legacyChatRoute.match(route.path) ||
    onSettings;
  const onHistory = !!historyRoute.match(route.path);
  const settingsOpen = settings || onSettings;
  const closeSettings = () => {
    setSettings(false);
    if (onSettings) go(chatRoute.href());
  };
  const title = settingsOpen
    ? 'Settings'
    : onChat
      ? 'Chat'
      : onHistory
        ? 'History'
        : onWiki
          ? (pages?.find((page) => page.id === wikiPage)?.title ?? 'Wiki')
          : 'Not found';
  const provider = useMemo(
    () =>
      session.secrets?.openai
        ? createOpenAICapabilities({
            apiKey: session.secrets.openai,
            baseURL: import.meta.env.VITE_OPENAI_API || undefined,
          })
        : null,
    [session.secrets?.openai],
  );
  const remoteModel = provider?.model ?? null;
  const speechProvider = provider?.liveTranscription ?? null;
  // Initial store readiness belongs to this session; replacing an opened store starts a new one.
  const chatScope = useRef<{ nodes: NodeStore | null; key: object }>({ nodes: null, key: {} });
  if (chatScope.current.nodes !== nodes) {
    chatScope.current = {
      nodes,
      key: chatScope.current.nodes === null && nodes ? chatScope.current.key : {},
    };
  }
  const chatSession = chatScope.current.key;
  const voice = useTranscription(preview?.transcription ?? speechProvider, chatSession);
  const availability = !nodes
    ? 'Opening the node store…'
    : nodeStatus.kind === 'error'
      ? `Node store error: ${nodeStatus.message}`
      : nodeStatus.kind === 'offline'
        ? 'The node store is offline. Connect to save messages.'
        : nodeStatus.kind !== 'synced'
          ? 'Opening the node store…'
          : identityState.owner !== setup || !identityState.ready
            ? identityState.error
              ? `Identity setup failed: ${identityState.error}`
              : 'Preparing Vault identities…'
            : !(suppliedModel ?? remoteModel)
              ? 'Configure an OpenAI key in Settings to send messages.'
              : undefined;
  const conversation = useConversation(
    productChatOptions({
      nodes: nodes ?? unavailableNodes,
      session: chatSession,
      identities,
      provider: preview?.provider ?? (suppliedModel ? 'preview' : 'openai'),
      model: suppliedModel ?? remoteModel ?? unavailableModel,
      selectedModel: selectedModel(preview?.defaultModel),
      instructions:
        'Help the Vault owner using the supplied content tools. Content changes are published directly as nodes. Do not claim to edit or commit legacy files.',
      suggestions: preview?.suggestions,
      availability,
      transcription: voice,
      conversation: conversationRoute.match(route.path)?.node,
      retainedConversation,
      onSelectionOutcome: (outcome) => {
        if (
          (outcome.status === 'blocked' || outcome.status === 'failed') &&
          parseRoute(location.hash).path === route.path
        )
          go(chatRoute.href());
      },
      onConversation: (id) => {
        const selected = conversationRoute.match(route.path)?.node;
        if (selected && selected !== id) go(conversationRoute.href({ node: id }));
        try {
          selectionStorage.setItem(conversationKey, id);
        } catch {
          /* Selection retention cannot invalidate accepted records. */
        }
      },
      stagedChanges: () => {
        const before = new Map(vault.base().map((file) => [file.path, file.text]));
        const after = new Map(vault.files().map((file) => [file.path, file.text]));
        return vault
          .staged()
          .map((path) => ({ path, before: before.get(path) ?? '', text: after.get(path) ?? null }));
      },
    }),
  );
  const [suppliedPrompt, setSuppliedPrompt] = useState<{
    owner: typeof conversation;
    value: Prompt;
  } | null>(null);
  const promptSequence = useRef(0);
  // Supplied intent belongs to the receiving owner, including owners replaced by effect replay.
  const prompt = suppliedPrompt?.owner === conversation ? suppliedPrompt.value : null;
  const { capture, turns, selectionAvailability } = useChat(conversation);
  const navigation: Navigation[] = [
    { label: 'Chat', href: chatRoute.href(), icon: 'sparkles', current: onChat },
    { label: 'Wiki', href: wikiRoute.href(), icon: 'book', current: onWiki },
    ...(nodes ? [{ label: 'History', href: historyRoute.href(), icon: 'history' as const }] : []),
    {
      label: 'Settings',
      href: settingsRoute.href(),
      icon: 'settings',
      kind: 'action',
      onSelect: () => setSettings(true),
      current: settingsOpen,
      expanded: settingsOpen,
    },
  ];
  const index = useMemo(
    () =>
      pages === null
        ? noteSearchIndex(files!)
        : new Map(pages.map((page) => [page.entry.href, page.entry])),
    [files, pages],
  );
  const ask = (text?: string) => {
    if (text)
      setSuppliedPrompt({
        owner: conversation,
        value: { text, send: true, n: ++promptSequence.current },
      });
    showPanel(true);
  };
  const voiceAction = () => {
    const capture = conversation.snapshot().capture;
    if (mobile && capture.allowed && (capture.action === 'start' || capture.action === 'finish')) {
      showPanel(false);
      go(chatRoute.href());
    }
    later(conversation.captureAction());
  };
  const commands: Command[] = [
    {
      id: 'go.wiki',
      label: 'Wiki',
      group: 'Go to',
      icon: 'book',
      keys: 'g w',
      run: () => go(wikiRoute.href()),
    },
    {
      id: 'go.chat',
      label: 'Chat',
      group: 'Go to',
      icon: 'sparkles',
      keys: 'g h',
      run: () => go(chatRoute.href()),
    },
    ...(nodes
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
      run: () => setSettings(true),
    },
    {
      id: 'agent.ask',
      label: 'Open Chat',
      group: 'Chat',
      icon: 'sparkles',
      keys: 'mod+j',
      run: () => showPanel(!panel),
    },
    ...(turns.length && selectionAvailability.allowed
      ? [
          {
            id: 'agent.new',
            label: 'New chat',
            group: 'Chat',
            icon: 'plus' as const,
            run: () => {
              const outcome = conversation.newChat();
              if (outcome.status === 'selected') ask();
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
              conversation.dispose();
              voice.dispose();
              wiki.dispose();
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
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry a deep page anchor after asynchronous page loading.
  useEffect(() => {
    const element = route.anchor && document.getElementById(route.anchor);
    if (element) element.scrollIntoView();
  }, [route.anchor, pages]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when navigating, not when accepted node data refreshes.
  useEffect(() => {
    if (!route.anchor) document.querySelector('[data-region=""]')?.scrollTo(0, 0);
  }, [route.path]);
  const statusLabel =
    status.kind === 'synced'
      ? `Synced ${new Date(status.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
      : status.kind === 'error'
        ? status.message
        : status.kind === 'offline'
          ? 'Offline'
          : 'Syncing…';
  return (
    <>
      <Frame
        navigation={navigation}
        status={statusLabel}
        failed={status.kind === 'error' || status.kind === 'offline'}
        signOut={
          session.signOut
            ? async () => {
                conversation.dispose();
                voice.dispose();
                wiki.dispose();
                await session.signOut!();
              }
            : null
        }
        onSearch={() => setSearch(true)}
        primary={{
          compact: !onChat && (
            <VoiceButton
              phase={capture.phase}
              busy={false}
              disabled={!capture.allowed}
              onClick={voiceAction}
            />
          ),
        }}
        panel={
          <ChatPanel
            conversation={conversation}
            prompt={onChat ? null : prompt}
            open={panel}
            onClose={() => showPanel(false)}
          />
        }
      >
        {identityState.owner === setup && identityState.error && (
          <Alert variant="destructive">
            <AlertDescription>{identityState.error}</AlertDescription>
            <Button onClick={() => later(prepareIdentities())}>Retry identity setup</Button>
          </Alert>
        )}
        {onChat ? (
          <ChatPage conversation={conversation} prompt={prompt} />
        ) : onWiki ? (
          <Wiki
            key={wikiPage ?? 'wiki'}
            pages={pages}
            node={wikiPage}
            error={wikiError}
            renderRecord={renderWikiRecord}
          />
        ) : onHistory ? (
          <Stack>
            <Row>
              <Button
                onClick={() => later(session.refreshNodes())}
                disabled={nodeStatus.kind === 'syncing'}
              >
                Refresh vault
              </Button>
              <Text role="status">
                {nodeStatus.kind === 'synced'
                  ? `Synced ${new Date(nodeStatus.at).toLocaleTimeString()}`
                  : nodeStatus.kind === 'error'
                    ? nodeStatus.message
                    : nodeStatus.kind}
              </Text>
            </Row>
            <HistoryPage nodes={nodeHistoryView} />
          </Stack>
        ) : (
          <Page>
            <Heading level={1}>Not found</Heading>
            <Text>Nothing at {route.path}.</Text>
            <Link href={link(chatRoute.href())}>Open Chat</Link>
          </Page>
        )}
      </Frame>
      <SettingsMenu
        open={settingsOpen}
        onClose={closeSettings}
        features={[
          { name: 'Chat', content: <ChatSettings defaultModel={preview?.defaultModel} /> },
        ]}
      >
        <SettingsSection title="Appearance">
          <SettingField
            label="Theme"
            description="Choose a theme, or follow your device's appearance."
          >
            <ThemeSwitch />
          </SettingField>
        </SettingsSection>
      </SettingsMenu>
      <Search commands={commands} index={index} open={search} setSearch={setSearch} onAsk={ask} />
      <Previews index={index} />
      <Overlay
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

/** Application composition for generic node History and guarded content compensation. */
export function productNodeHistory(
  nodes: NodeStore,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const canUndo = (difference: NodeDifference) =>
    preservesAgentRecords(difference) &&
    preservesChatRecords(difference) &&
    canUndoContent(difference);
  const prepareUndo = (options: { transaction: string; recordedBy: string; id: string }) =>
    prepareContentUndo(nodes, { ...options, canUndo });
  return {
    entries: (options?: Parameters<NodeStore['history']>[0]) => nodeHistory(nodes, options),
    subscribe: nodes.subscribe,
    prepareUndo,
    canUndo: (entry: NodeHistoryEntry) =>
      entry.differences.length > 0 && entry.differences.every(canUndo),
    /** Compensates as the owner; acceptance rejects it if an affected node changed since. */
    undo: async (entry: NodeHistoryEntry) =>
      nodes.commit(
        await prepareUndo({
          transaction: entry.transaction.id,
          recordedBy: identities.user,
          id: crypto.randomUUID(),
        }),
      ),
  };
}

type ProductChatOptions = Omit<
  NodeConversationOptions,
  'user' | 'agent' | 'tools' | 'writableKinds' | 'enabledTools' | 'settings'
> & { readonly identities?: ApplicationIdentities };
/** The same explicit composition used by the Product views and independent application callers. */
export function productChatOptions({
  identities = defaultIdentities,
  ...options
}: ProductChatOptions): NodeConversationOptions {
  return {
    ...options,
    user: identities.user,
    agent: identities.agent,
    tools: nodeContentTools,
    writableKinds: contentKinds,
    enabledTools: enabledContentTools,
    settings: chatSettings,
  };
}
export function createProductConversation(options: ProductChatOptions) {
  return createNodeConversation(productChatOptions(options));
}

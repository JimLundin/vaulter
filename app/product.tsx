// The product's explicit assembly. Only this file imports optional workflows.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import { createSettings } from './settings.ts';
import { ModuleSettings, SecretSettings } from './ui/ModuleSettings.tsx';
import { AppearanceSettings, appearanceSettings } from './ui/AppearanceSettings.tsx';
import { agentSettings, agentOptions } from './agent/settings.ts';
import {
  createOpenAISettings,
  createOpenAIPreferences,
  openAIOptions,
} from './agent/openai/settings.ts';
import { githubSettings } from './vault/storage/settings.ts';
import { jinaSettings } from './agent/jina/settings.ts';
import { chatPreferences, chatSettings } from './workflows/chat/preferences.ts';
import type { Secrets } from './vault/session/sealed.ts';
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
  VoiceButton,
  Row,
  Stack,
  Text,
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
import { preservesAgentRecords } from './agent/preservation.ts';
import type { AgentToolFactory } from './agent/tools.ts';
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
import { recordText } from './workflows/wiki/text.ts';
import { isWikiContent } from './workflows/wiki/citations.ts';
import {
  QuestionItem,
  QuestionsPage,
  questionsRoute,
  questionRoute,
  useQuestions,
  useQuestionsReading,
  readQuestions,
  type Question,
  type QuestionTarget,
  type QuestionTargetDescription,
} from './workflows/questions/index.tsx';
import { prepareAnswerQuestion } from './workflows/questions/operations.ts';
import { questionTools, type QuestionContextReading } from './workflows/questions/tools.ts';
import { questionSources } from './workflows/questions/sources.ts';

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
const executionPreferences = createSettings(agentSettings);
const storagePreferences = createSettings(githubSettings);
const contentKinds = ['content', 'question', 'relationship'];
const enabledContentTools = [
  { name: 'createNode' },
  { name: 'readNode' },
  { name: 'updateNode' },
  { name: 'askQuestion' },
  { name: 'listQuestionSubjects' },
  { name: 'listQuestionContext' },
  { name: 'readQuestion' },
  { name: 'listQuestions' },
];
const chatSourceReader = chatSources((node) => `#${conversationRoute.href({ node })}`);
const sourceOwners = [
  chatSourceReader,
  contentSources,
  questionSources,
  retainedRecordSources,
  agentSources,
];
const productSources: SourceReader = {
  text: (node, context) => {
    for (const owner of sourceOwners) {
      const text = owner.text(node, context);
      if (text !== undefined) return text;
    }
  },
  describe: (node, view) => describeSource(node, view, sourceOwners),
};
const questionContextReading: QuestionContextReading = {
  text: (node, view) => {
    if (node.data?.kind === 'contextInput' && ['system', 'tool'].includes(String(node.data.role)))
      return;
    // Only text held in this version is self-contained. Composite sources need a snapshot selection.
    if (
      !(
        typeof node.data?.text === 'string' ||
        (node.data?.kind === 'message' && Array.isArray(node.data.parts)) ||
        (node.data?.kind === 'contextInput' && typeof node.data.content === 'string')
      )
    )
      return;
    try {
      return recordText(node, view, productSources);
    } catch {
      // Unsupported source records are not grounding passages.
    }
  },
  isKnowledge: (node, view) => node.data?.kind !== 'contextInput' && isWikiContent(node, view),
  title: (node, view) => {
    const description = productSources.describe(node, view);
    if (description?.title) return description.title;
    let current = node;
    const seen = new Set<string>();
    while (current.data && !seen.has(current.key.node)) {
      seen.add(current.key.node);
      if (current.data.kind === 'page') return String(current.data.title ?? 'Wiki page');
      const parent = current.placement && view.get(current.placement.parent);
      if (!parent) break;
      current = parent;
    }
    return 'Retained source';
  },
};
const productToolFactories = new WeakMap<NodeStore, AgentToolFactory>();
function productTools(nodes: NodeStore): AgentToolFactory {
  let factory = productToolFactories.get(nodes);
  if (!factory) {
    factory = (context) => ({
      ...nodeContentTools(context),
      ...questionTools(context, nodes, questionContextReading),
    });
    productToolFactories.set(nodes, factory);
  }
  return factory;
}

type VaultSession = ReturnType<typeof useVaultSession>;
type SuppliedSession = Omit<VaultSession, 'identity' | 'credentialPending'> &
  Partial<Pick<VaultSession, 'identity' | 'credentialPending'>>;

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
  session: SuppliedSession;
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
  const providerDefinition = useMemo(
    () =>
      createOpenAISettings({
        defaultModel: preview?.defaultModel,
        baseURL: import.meta.env.VITE_OPENAI_API,
      }),
    [preview?.defaultModel],
  );
  const providerPreferences = useMemo(
    () => createOpenAIPreferences(providerDefinition),
    [providerDefinition],
  );
  const providerValues = useSyncExternalStore(
    providerPreferences.subscribe,
    providerPreferences.snapshot,
  );
  const executionValues = useSyncExternalStore(
    executionPreferences.subscribe,
    executionPreferences.snapshot,
  );
  const chatValues = useSyncExternalStore(chatPreferences.subscribe, chatPreferences.snapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot invalidates parsed settings from this store.
  const executionSettings = useMemo(
    () => agentOptions(executionPreferences.values()),
    [executionValues],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot invalidates parsed settings from this store.
  const providerOptions = useMemo(
    () => openAIOptions(providerPreferences.values()),
    [providerValues, providerPreferences],
  );
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
  const route = useRoute();
  const wikiSources = productSources;
  const wiki = useWikiReading(nodes, wikiSources);
  const { pages, error: wikiError } = useWiki(wiki);
  const wikiPage = pageRoute.match(route.path)?.node;
  const onWiki = !!wikiRoute.match(route.path) || !!wikiPage;
  const selectedQuestion = questionRoute.match(route.path)?.node;
  const onQuestions = !!questionsRoute.match(route.path) || !!selectedQuestion;
  const questions = useQuestionsReading(onWiki || onQuestions ? nodes : null);
  const questionState = useQuestions(questions);
  const questionIndex = useMemo(
    () => new Map(questionState.questions?.map((question) => [question.id, question])),
    [questionState.questions],
  );
  const answerAvailability = !nodes
    ? 'Opening the node store…'
    : nodeStatus.kind === 'error'
      ? `Node store error: ${nodeStatus.message}`
      : nodeStatus.kind === 'offline'
        ? 'Connect to save an answer.'
        : nodeStatus.kind !== 'synced'
          ? 'Opening the node store…'
          : identityState.owner !== setup || !identityState.ready
            ? 'Preparing Vault identities…'
            : questionState.error
              ? 'Refresh questions before saving an answer.'
              : questionState.loading
                ? 'Refreshing questions…'
                : undefined;
  const answerQuestion = async (question: Question, text: string) => {
    if (!nodes || answerAvailability)
      throw new Error(answerAvailability ?? 'Node store is unavailable.');
    const view = await nodes.snapshot();
    const current = (await readQuestions(nodes, view)).find((entry) => entry.id === question.id);
    if (!current || current.status !== 'open')
      throw new Error('This question is no longer open. Review its current status.');
    const request = prepareAnswerQuestion(view, {
      id: crypto.randomUUID(),
      node: crypto.randomUUID(),
      relationship: crypto.randomUUID(),
      question: question.key,
      text,
      relationships: current.answers.flatMap((answer) => {
        const relationship = answer.relationship && view.get(answer.relationship);
        return relationship ? [relationship] : [];
      }),
    });
    await nodes.commit({
      ...request,
      recordedBy: identities.user,
      origin: question.id,
      undoOf: null,
    });
  };
  const describeQuestionTarget = (
    target: QuestionTarget,
  ): QuestionTargetDescription | undefined => {
    if (!(target.version && questionState.view)) return;
    const text = questionContextReading.text(target.version, questionState.view);
    const description = wikiSources.describe(target.version, questionState.view);
    if (description)
      return {
        ...description,
        text,
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
          title: String(current.data.title ?? 'Wiki page'),
          text,
          href: `#${pageRoute.href({ node: current.key.node })}`,
          navigationLabel: `Open Wiki page: ${String(current.data.title ?? 'Wiki page')}`,
        };
      if (!current.placement) break;
      const parent = questionState.view.get(current.placement.parent);
      if (!parent?.data) break;
      current = parent;
    }
    if (text) return { title: 'Retained source', text };
  };
  const describeQuestionAuthor = (question: Question) => {
    const data = question.created && questionState.view?.resolve(question.created.author)?.data;
    return typeof data?.name === 'string'
      ? data.name
      : data?.kind === 'agent'
        ? 'agent'
        : data?.kind === 'actor'
          ? 'you'
          : undefined;
  };
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
          describeTarget={describeQuestionTarget}
          describeAuthor={describeQuestionAuthor}
          onAnswer={answerQuestion}
          disabledReason={answerAvailability}
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
          : onQuestions
            ? 'Questions'
            : 'Not found';
  const provider = useMemo(
    () =>
      session.secrets?.openai
        ? createOpenAICapabilities({
            apiKey: session.secrets.openai,
            baseURL: import.meta.env.VITE_OPENAI_API || undefined,
            ...providerOptions,
          })
        : null,
    [session.secrets?.openai, providerOptions],
  );
  const remoteModel = provider?.model ?? null;
  const speechProvider = provider?.dictation ?? null;
  // Supplied session identity survives credential reconnects; independent stores get a new owner.
  const chatScope = useRef<{ nodes: NodeStore | null; key: object }>({ nodes: null, key: {} });
  if (chatScope.current.nodes !== nodes) {
    chatScope.current = {
      nodes,
      key: chatScope.current.nodes === null && nodes ? chatScope.current.key : {},
    };
  }
  const chatSession = session.identity ?? chatScope.current.key;
  const voice = useTranscription(preview?.transcription ?? speechProvider, chatSession);
  const availability = session.credentialPending
    ? 'Wait for the credential update to finish before starting agent activity.'
    : !nodes
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
      selectedModel: providerOptions.models.llm,
      instructions:
        chatValues.instructions + (wikiPage ? ` The owner is viewing Wiki page ${wikiPage}.` : ''),
      settings: executionSettings,
      suggestions: preview?.suggestions,
      availability,
      captureAvailability: session.credentialPending
        ? 'Wait for the credential update to finish before starting recording.'
        : undefined,
      transcription: voice,
      conversation: conversationRoute.match(route.path)?.node,
      recordsReady: !!nodes && !['loading', 'syncing'].includes(nodeStatus.kind),
      onSelectionOutcome: (outcome) => {
        if (
          (outcome.status === 'blocked' || outcome.status === 'failed') &&
          parseRoute(location.hash).path === route.path
        )
          go(chatRoute.href());
      },
      onConversation: (id) => {
        const path = parseRoute(location.hash).path;
        const selected = conversationRoute.match(path)?.node;
        if (
          selected !== id &&
          (selected || path === '/' || chatRoute.match(path) || legacyChatRoute.match(path))
        )
          go(conversationRoute.href({ node: id }));
      },
      onNewChat: () => {
        if (conversationRoute.match(parseRoute(location.hash).path)) go(chatRoute.href());
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
  const { capture, turns, selectionAvailability, busy, recovery } = useChat(conversation);
  const credentialReason = preview
    ? 'Credentials are supplied by the preview server.'
    : session.credentialPending
      ? 'Credentials are being updated. Wait for the update to finish.'
      : busy ||
          Object.keys(recovery).length > 0 ||
          ['connecting', 'listening', 'finishing'].includes(capture.phase)
        ? 'Finish or stop the current agent activity before changing credentials.'
        : undefined;
  const configured = Object.fromEntries(
    (['github', 'openai', 'jina'] as const).map((key) => [key, Boolean(session.secrets?.[key])]),
  );
  const overridden = Object.fromEntries(
    (['github', 'openai', 'jina'] as const).map((key) => [
      key,
      Object.hasOwn(session.secretOverrides, key),
    ]),
  );
  const credentialProps = {
    configured,
    overridden,
    disabledReason: credentialReason,
    persistent: !import.meta.env.DEV,
    onChange: (key: string, value: string | null | undefined) =>
      session.updateSecret(key as keyof Secrets, value),
  };
  const navigation: Navigation[] = [
    { label: 'Chat', href: chatRoute.href(), icon: 'sparkles', current: onChat },
    { label: 'Wiki', href: wikiRoute.href(), icon: 'book', current: onWiki },
    { label: 'Questions', href: questionsRoute.href(), icon: 'help', current: onQuestions },
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
    {
      id: 'go.questions',
      label: 'Questions',
      group: 'Go to',
      icon: 'help',
      keys: 'g q',
      run: () => go(questionsRoute.href()),
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
              questions.dispose();
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
                questions.dispose();
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
        ) : onQuestions ? (
          <QuestionsPage
            key={selectedQuestion ?? 'questions'}
            state={questionState}
            node={selectedQuestion}
            describeTarget={describeQuestionTarget}
            describeAuthor={describeQuestionAuthor}
            onAnswer={answerQuestion}
            disabledReason={answerAvailability}
          />
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
          { name: appearanceSettings.name, content: <AppearanceSettings /> },
          { name: chatSettings.name, content: <ChatSettings /> },
          {
            name: agentSettings.name,
            content: <ModuleSettings definition={agentSettings} store={executionPreferences} />,
          },
          {
            name: providerDefinition.name,
            content: (
              <Stack gap="lg">
                <SecretSettings definition={providerDefinition} {...credentialProps} />
                <ModuleSettings definition={providerDefinition} store={providerPreferences} />
              </Stack>
            ),
          },
          {
            name: githubSettings.name,
            content: (
              <Stack gap="lg">
                <SecretSettings definition={githubSettings} {...credentialProps} />
                <ModuleSettings definition={githubSettings} store={storagePreferences} />
              </Stack>
            ),
          },
          {
            name: jinaSettings.name,
            content: <SecretSettings definition={jinaSettings} {...credentialProps} />,
          },
        ]}
      />
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
  'user' | 'agent' | 'tools' | 'writableKinds' | 'enabledTools'
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
    tools: productTools(options.nodes),
    writableKinds: contentKinds,
    enabledTools: enabledContentTools,
    settings: options.settings ?? agentOptions(executionPreferences.values()),
  };
}
export function createProductConversation(options: ProductChatOptions) {
  return createNodeConversation(productChatOptions(options));
}

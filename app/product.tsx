// The product's explicit assembly. Only this file imports optional workflows.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranscription, type TranscriptionProvider } from './transcription.ts';
import type { LanguageModel } from 'ai';
import {
  useVaultSession,
  noteSearchIndex,
  type OpenBackend,
  type OpenNodes,
  VaultGate,
  RefreshNodes,
  SessionStatus,
  SignOut,
  createSessionCredentials,
  restrictSessionCredentials,
} from './vault/index.ts';
import { Frame } from './ui/Frame.tsx';
import { Search, Keys } from './ui/Search.tsx';
import { Previews } from './ui/Previews.tsx';
import { useKeys } from './ui/keys.ts';
import { opened } from './ui/recent.ts';
import { go, link, parseRoute, pattern, useRoute } from './ui/routing.ts';
import { later } from './ui/later.ts';
import { AppearanceSettings, appearanceSettings } from './ui/AppearanceSettings.tsx';
import { agentSettings, agentOptions, agentPreferences } from './agent/settings.ts';
import { AgentSettings } from './agent/Settings.tsx';
import { OpenAISettings } from './agent/openai/Settings.tsx';
import { JinaSettings } from './agent/jina/Settings.tsx';
import { GitHubSettings } from './vault/storage/Settings.tsx';
import {
  createOpenAISettings,
  createOpenAIPreferences,
  openAIOptions,
} from './agent/openai/settings.ts';
import { githubSettings } from './vault/storage/settings.ts';
import { jinaSettings } from './agent/jina/settings.ts';
import { chatPreferences, chatSettings } from './workflows/chat/preferences.ts';
import { nodeWriteAvailability, nodeRecordsReady } from './vault/session/availability.ts';
import {
  Button,
  Alert,
  AlertDescription,
  Heading,
  Link,
  Overlay,
  Page,
  SettingsMenu,
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
import { contentEnabledTools } from './vault/content/tool-actions.ts';
import { contentToolPresentation } from './vault/content/tool-presentation.tsx';
import type { NodeDifference, NodeStore } from './vault/nodes/store.ts';
import type { TransactionStore } from './vault/transactions/store.ts';
import { createTransactionSession, withPublication } from './vault/transactions/lifetime.ts';
import { createOpenAICapabilities } from './agent/openai/index.ts';
import { preservesAgentRecords } from './agent/preservation.ts';
import type { AgentToolFactory } from './agent/tools.ts';
import { agentSources, isAgentContext } from './agent/sources.ts';
import { preservesChatRecords } from './workflows/chat/records/chat.ts';
import { chatSources } from './workflows/chat/records/sources.ts';
import { contentSources } from './vault/content/sources.ts';
import { retainedRecordSources } from './vault/records/sources.ts';
import { describeSource, type SourceReader } from './vault/sources.ts';
import { identityName } from './vault/records/identities.ts';
import {
  createNodeConversation,
  type NodeConversationOptions,
} from './workflows/chat/node-conversation.ts';
import { transactionHistory } from './vault/transactions/history/nodes.ts';
import { HistoryPage } from './vault/transactions/history/index.tsx';
import { Wiki, type ForeignRecordRenderer } from './workflows/wiki/index.tsx';
import { wikiRoute, pageRoute } from './workflows/wiki/routes.ts';
import { useWikiReading, useWiki } from './workflows/wiki/use-wiki.ts';
import { isWikiContent } from './workflows/wiki/citations.ts';
import { wikiSources as wikiSourceReader, describeWikiTarget } from './workflows/wiki/sources.ts';
import {
  QuestionsPage,
  questionsRoute,
  questionRoute,
  useQuestions,
  useQuestionsReading,
  useQuestionAnswers,
  questionAnswerAvailability,
  questionDescriptions,
  renderQuestionRecord,
} from './workflows/questions/index.tsx';
import { questionTools, type QuestionContextReading } from './workflows/questions/tools.ts';
import { createQuestionOwnership } from './workflows/questions/actions.ts';
import { questionSources } from './workflows/questions/sources.ts';
import { questionEnabledTools } from './workflows/questions/tool-actions.ts';
import { questionToolPresentation } from './workflows/questions/tool-presentation.tsx';

const chatRoute = pattern('/chat/');
const conversationRoute = pattern('/chat/:node/');
const legacyChatRoute = pattern('/agent/');
const historyRoute = pattern('/history/');
const settingsRoute = pattern('/settings/');
const unavailableNodes: TransactionStore = {
  identity: {},
  writer: () => ({
    lifetime: () => {
      throw new Error('Node store is unavailable.');
    },
  }),
  snapshot: () => Promise.reject(new Error('Node store is unavailable.')),
  history: async () => [],
  changes: async () => [],
  subscribe: () => () => undefined,
};
const unavailableModel = () =>
  Promise.reject(new Error('Configure an OpenAI key to send messages.'));
const contentKinds = ['content', 'question', 'relationship'];
const enabledContentTools = [...contentEnabledTools, ...questionEnabledTools];
const toolPresentations = [contentToolPresentation, questionToolPresentation];
const chatSourceReader = chatSources((node) => `#${conversationRoute.href({ node })}`);
const sourceOwners = [
  chatSourceReader,
  contentSources,
  questionSources,
  retainedRecordSources,
  agentSources,
];
const productSources: SourceReader = {
  exactText: (node, view) => {
    for (const owner of [...sourceOwners, wikiSourceReader]) {
      const text = owner.exactText?.(node, view);
      if (text !== undefined) return text;
    }
  },
  text: (node, context) => {
    for (const owner of sourceOwners) {
      const text = owner.text(node, context);
      if (text !== undefined) return text;
    }
  },
  describe: (node, view) => describeSource(node, view, sourceOwners),
};
const questionContextReading: QuestionContextReading = {
  text: (node, view) => productSources.exactText?.(node, view),
  isKnowledge: (node, view) => !isAgentContext(node) && isWikiContent(node, view),
  title: (node, view) =>
    productSources.describe(node, view)?.title ||
    describeWikiTarget(node, view)?.title ||
    'Retained source',
};
interface ProductNodeOwner {
  nodes: TransactionStore;
  readonly questions: ReturnType<typeof createQuestionOwnership>;
  readonly histories: Map<string, ReturnType<typeof transactionHistory>>;
  readonly transactions?: ReturnType<typeof createTransactionSession>;
  source: NodeStore | TransactionStore;
  session?: object;
}
const productNodeOwners = new WeakMap<object, ProductNodeOwner>();
const productQuestionSessions = new WeakMap<object, ProductNodeOwner>();

/** Product supplies owner rules; the core owns the session and every publication attempt. */
export function productNodes(
  supplied: NodeStore | TransactionStore,
  session?: object,
): TransactionStore {
  let owner =
    (session && productQuestionSessions.get(session)) ||
    productNodeOwners.get(supplied) ||
    ('writer' in supplied ? productNodeOwners.get(supplied.identity) : undefined);
  if (owner && session && owner.session && owner.session !== session) owner = undefined;
  if (!owner) {
    const transactions = 'writer' in supplied ? undefined : createTransactionSession(supplied);
    const reading = transactions?.nodes ?? (supplied as TransactionStore);
    const questions = createQuestionOwnership({ nodes: reading, reading: questionContextReading });
    owner = {
      nodes: withPublication(reading, questions.publication),
      questions,
      histories: new Map(),
      transactions,
      source: supplied,
    };
    productNodeOwners.set(reading.identity, owner);
    productNodeOwners.set(reading, owner);
    productNodeOwners.set(owner.nodes, owner);
  } else if (owner.source !== supplied && owner.nodes !== supplied) {
    let reading: TransactionStore;
    if ('writer' in supplied) {
      if (supplied.identity !== owner.nodes.identity)
        throw new Error('Adapter replacement must retain the Vault Transaction session.');
      reading = supplied;
    } else {
      if (!owner.transactions)
        throw new Error('Replace the adapter through its owning Vault Transaction session.');
      void owner.transactions.replace(supplied);
      reading = owner.transactions.nodes;
    }
    owner.nodes = withPublication(reading, owner.questions.publication);
    productNodeOwners.set(owner.nodes, owner);
    owner.source = supplied;
  }
  productNodeOwners.set(supplied, owner);
  if (session) {
    owner.session = session;
    productQuestionSessions.set(session, owner);
  }
  return owner.nodes;
}

function productQuestions(source: TransactionStore) {
  return (productNodeOwners.get(source) ?? productNodeOwners.get(productNodes(source)))!.questions;
}
const productToolFactories = new WeakMap<TransactionStore, AgentToolFactory>();
function productTools(nodes: TransactionStore): AgentToolFactory {
  let factory = productToolFactories.get(nodes);
  if (!factory) {
    factory = (context) => ({
      ...nodeContentTools(context),
      ...questionTools(context, nodes, questionContextReading, productQuestions(nodes)),
    });
    productToolFactories.set(nodes, factory);
  }
  return factory;
}

type VaultSession = ReturnType<typeof useVaultSession>;
type SuppliedSession = Omit<VaultSession, 'identity' | 'credentialPending' | 'credentials'> &
  Partial<Pick<VaultSession, 'identity' | 'credentialPending' | 'credentials'>>;

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
  return (
    <VaultGate state={session}>
      <OpenProduct session={session} identities={identities} />
    </VaultGate>
  );
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
  const { vault, files, status, nodeStatus } = session;
  const nodes = session.nodes ? productNodes(session.nodes, session.identity) : null;
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
    agentPreferences.subscribe,
    agentPreferences.snapshot,
  );
  const chatValues = useSyncExternalStore(chatPreferences.subscribe, chatPreferences.snapshot);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot invalidates parsed settings from this store.
  const executionSettings = useMemo(
    () => agentOptions(agentPreferences.values()),
    [executionValues],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: the snapshot invalidates parsed settings from this store.
  const providerOptions = useMemo(
    () => openAIOptions(providerPreferences.values()),
    [providerValues, providerPreferences],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: borrowed facades follow adapter replacement; identity owns bootstrap recovery.
  const setup = useMemo(
    () => (nodes ? createApplicationIdentities(nodes, identities) : null),
    [nodes?.identity, identities.user, identities.agent],
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
  // Session identity survives credential reconnects; independent supplied stores get a new owner.
  const chatScope = useRef<{ nodes: TransactionStore | null; key: object }>({
    nodes: null,
    key: {},
  });
  if (chatScope.current.nodes?.identity !== nodes?.identity) {
    chatScope.current = {
      nodes,
      key: chatScope.current.nodes === null && nodes ? chatScope.current.key : {},
    };
  }
  const chatSession = session.identity ?? chatScope.current.key;
  const writeAdmission = session.credentialPending
    ? 'Wait for the credential update to finish before saving changes.'
    : (nodeWriteAvailability(nodeStatus, !!nodes) ??
      (identityState.owner !== setup || !identityState.ready
        ? 'Preparing Vault identities…'
        : undefined));
  const admission = useRef(writeAdmission);
  admission.current = writeAdmission;
  const answers = useQuestionAnswers({
    session: chatSession,
    nodes,
    ownership: nodes ? productQuestions(nodes) : undefined,
    recordedBy: identities.user,
    admission: () => admission.current,
  });
  const answerAvailability = questionAnswerAvailability(questionState, writeAdmission);
  const descriptions = questionDescriptions(
    questionState.view,
    {
      text: questionContextReading.text,
      describe: (node, view) =>
        productSources.describe(node, view) ?? describeWikiTarget(node, view),
    },
    identityName,
  );
  const renderWikiRecord: ForeignRecordRenderer = (record) =>
    renderQuestionRecord(record, questionState, {
      ...descriptions,
      answers,
      onAnswer: answers.answer,
      disabledReason: writeAdmission,
      transcription: voice,
    });
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
  const dismissSupportingTasks = () => {
    setSettings(false);
    setSearch(false);
    setHelp(false);
    showPanel(false);
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
  const voice = useTranscription(preview?.transcription ?? speechProvider, chatSession);
  const availability = session.credentialPending
    ? 'Wait for the credential update to finish before starting agent activity.'
    : (nodeWriteAvailability(nodeStatus, !!nodes) ??
      (identityState.owner !== setup || !identityState.ready
        ? identityState.error
          ? `Identity setup failed: ${identityState.error}`
          : 'Preparing Vault identities…'
        : !(suppliedModel ?? remoteModel)
          ? 'Configure an OpenAI key in Settings to send messages.'
          : undefined));
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
      recordsReady: !!nodes && nodeRecordsReady(nodeStatus),
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
  const { capture, turns, selectionAvailability } = useChat(conversation);
  const currentSession = useRef(session);
  currentSession.current = session;
  const currentConversation = useRef(conversation);
  currentConversation.current = conversation;
  const credentialReason = () => {
    if (preview) return 'Credentials are supplied by the preview server.';
    const state = currentConversation.current.snapshot();
    if (
      state.busy ||
      Object.keys(state.recovery).length > 0 ||
      ['connecting', 'listening', 'finishing'].includes(state.capture.phase)
    )
      return 'Finish or stop the current agent activity before changing credentials.';
  };
  const credentials = restrictSessionCredentials(
    session.credentials ??
      createSessionCredentials(session, {
        persistent: false,
        read: () => currentSession.current,
      }),
    credentialReason,
  );
  const signOut = session.signOut
    ? async () => {
        conversation.dispose();
        voice.dispose();
        wiki.dispose();
        questions.dispose();
        answers.dispose();
        await session.signOut!();
      }
    : null;
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
    if (mobile) dismissSupportingTasks();
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
            run: () => later(signOut!()),
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
  return (
    <>
      <Frame
        navigation={navigation}
        status={<SessionStatus status={status} />}
        signOut={signOut && <SignOut onSignOut={signOut} />}
        onSearch={() => {
          if (mobile) dismissSupportingTasks();
          setSearch(true);
        }}
        onNavigate={mobile ? dismissSupportingTasks : undefined}
        primary={{
          menu: {
            label:
              capture.phase === 'connecting'
                ? 'Cancel recording'
                : capture.phase === 'listening'
                  ? 'Finish recording'
                  : capture.phase === 'finishing'
                    ? 'Finishing transcript'
                    : 'Start voice interaction',
            icon:
              capture.phase === 'listening'
                ? 'stop'
                : capture.phase === 'connecting' || capture.phase === 'finishing'
                  ? 'clock'
                  : 'mic',
            disabled: !capture.allowed || capture.phase === 'finishing',
            onSelect: voiceAction,
          },
        }}
        panel={
          <ChatPanel
            conversation={conversation}
            toolPresentations={toolPresentations}
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
          <ChatPage
            conversation={conversation}
            prompt={prompt}
            toolPresentations={toolPresentations}
          />
        ) : onQuestions ? (
          <QuestionsPage
            key={selectedQuestion ?? 'questions'}
            state={questionState}
            node={selectedQuestion}
            {...descriptions}
            answers={answers}
            onAnswer={answers.answer}
            disabledReason={answerAvailability}
            transcription={voice}
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
            <RefreshNodes status={nodeStatus} refresh={session.refreshNodes} />
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
            content: <AgentSettings />,
          },
          {
            name: providerDefinition.name,
            content: (
              <OpenAISettings
                definition={providerDefinition}
                preferences={providerPreferences}
                credential={credentials.openai}
              />
            ),
          },
          {
            name: githubSettings.name,
            content: <GitHubSettings credential={credentials.github} />,
          },
          {
            name: jinaSettings.name,
            content: <JinaSettings credential={credentials.jina} />,
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
  source: NodeStore | TransactionStore,
  identities: ApplicationIdentities = defaultIdentities,
) {
  const nodes = productNodes(source);
  const histories = productNodeOwners.get(nodes)!.histories;
  const existing = histories.get(identities.user);
  if (existing) return existing;
  const canUndo = (difference: NodeDifference) =>
    preservesAgentRecords(difference) &&
    preservesChatRecords(difference) &&
    canUndoContent(difference);
  const history = transactionHistory(nodes, { recordedBy: identities.user, canUndo });
  histories.set(identities.user, history);
  return history;
}

type ProductChatOptions = Omit<
  NodeConversationOptions,
  'user' | 'agent' | 'tools' | 'writableKinds' | 'enabledTools' | 'nodes'
> & { readonly nodes: NodeStore | TransactionStore; readonly identities?: ApplicationIdentities };
/** The same explicit composition used by the Product views and independent application callers. */
export function productChatOptions({
  identities = defaultIdentities,
  ...options
}: ProductChatOptions): NodeConversationOptions {
  const nodes = productNodes(options.nodes);
  return {
    ...options,
    nodes,
    user: identities.user,
    agent: identities.agent,
    tools: productTools(nodes),
    writableKinds: contentKinds,
    enabledTools: enabledContentTools,
    settings: options.settings ?? agentOptions(agentPreferences.values()),
  };
}
export function createProductConversation(options: ProductChatOptions) {
  return createNodeConversation(productChatOptions(options));
}

import { MapPage, useMap, mapRoute } from '@/map/index.ts';
import { applicationQuestionCollection, applicationQuestionAnswers } from './composition.ts';
import { chatRoute, conversationRoute, historyRoute, settingsRoute } from './routes.ts';
import {
  CalendarPage,
  CalendarTimeline,
  useCalendar,
  calendarRoute,
  calendarEntries,
  type CalendarData,
} from '@/calendar/index.ts';
import {
  applicationHistory,
  applicationChatOptions,
  applicationGraphInput,
  applicationDatabase,
  applicationWiki,
  applicationCalendar,
  applicationMap,
  applicationSubjectCalendar,
  toolPresentations,
} from './composition.ts';
// Application shell and module views. Record composition lives in composition.ts.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranscription, type TranscriptionProvider } from '@/transcription.ts';
import type { LanguageModel } from 'ai';
import {
  useVaultSession,
  type OpenEav,
  VaultGate,
  RefreshVault,
  SessionStatus,
  SignOut,
  createSessionCredentials,
  restrictSessionCredentials,
} from '@/vault/index.ts';
import { Frame } from './Frame.tsx';
import { Search, Keys } from '@/search/Search.tsx';
import { Previews } from './Previews.tsx';
import { useKeys } from '@/navigation/keys.ts';
import { opened } from '@/search/recent.ts';
import { go, link, parseRoute, useRoute } from '@/navigation/routing.ts';
import { later } from '@/runtime/later.ts';
import { AppearanceSettings, appearanceSettings } from './AppearanceSettings.tsx';
import { agentSettings, agentOptions, agentPreferences } from '@/agent/settings.ts';
import { AgentSettings } from '@/agent/Settings.tsx';
import { OpenAISettings } from '@/agent/openai/Settings.tsx';
import { GitHubSettings } from '@/vault/storage/Settings.tsx';
import {
  createOpenAISettings,
  createOpenAIPreferences,
  openAIOptions,
} from '@/agent/openai/settings.ts';
import { githubSettings } from '@/vault/storage/settings.ts';
import { chatPreferences, chatSettings } from '@/workflows/chat/preferences.ts';
import { writeAvailability, recordsReady } from '@/vault/session/availability.ts';
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
} from '@/ui/kit/index.ts';
import type { Command, Navigation } from '@/navigation/commands.ts';
import {
  ChatPage,
  ChatPanel,
  ChatSettings,
  useConversation,
  useChat,
  type Prompt,
} from '@/workflows/chat/index.tsx';
import {
  createApplicationIdentities,
  defaultIdentities,
  type ApplicationIdentities,
} from './identities.ts';
import { createOpenAICapabilities } from '@/agent/openai/index.ts';
import { HistoryDrawer } from '@/vault/transactions/history/index.tsx';
import { Wiki, type ForeignRecordRenderer } from '@/workflows/wiki/index.tsx';
import { wikiRoute, pageRoute } from '@/workflows/wiki/routes.ts';
import { useEavWikiReading } from '@/workflows/wiki/data/reading.ts';
import { GraphPage } from '@/workflows/graph/GraphPage.tsx';
import { graphRoute, graphSubjectRoute } from '@/workflows/graph/routes.ts';
import { useGraph, useGraphExplorer } from '@/workflows/graph/use-graph.ts';
import {
  QuestionsPage,
  questionsRoute,
  useQuestions,
  useQuestionsReading,
  useQuestionAnswers,
  questionAnswerAvailability,
  questionDescriptions,
  renderQuestionRecord,
} from '@/workflows/questions/index.tsx';

const unavailableModel = () =>
  Promise.reject(new Error('Configure an OpenAI key to send messages.'));
type VaultSession = ReturnType<typeof useVaultSession>;
type SuppliedSession = Omit<VaultSession, 'identity' | 'credentialPending' | 'credentials'> &
  Partial<Pick<VaultSession, 'identity' | 'credentialPending' | 'credentials'>>;

export function Application({
  openEav,
  identities,
}: {
  openEav: OpenEav;
  identities?: ApplicationIdentities;
}) {
  const session = useVaultSession(openEav);
  return (
    <VaultGate state={session}>
      <OpenApplication session={session} identities={identities} />
    </VaultGate>
  );
}

/** The same product views with supplied session/model adapters, including the design preview. */
export function OpenApplication({
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
  const { status, eav } = session;
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
    () => (eav ? createApplicationIdentities(() => applicationDatabase(eav), identities) : null),
    [eav, identities.user, identities.agent],
  );
  const historyAdmission = useRef<() => string | undefined>(() => 'Opening the vault…');
  const historyView = useMemo(
    () => (eav ? applicationHistory(eav, identities, () => historyAdmission.current()) : undefined),
    [eav, identities],
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
    if (status.kind === 'synced') later(prepareIdentities());
  }, [prepareIdentities, status.kind]);
  const route = useRoute();
  const wikiInput = useMemo(
    () => (session.eav ? applicationWiki(session.eav) : null),
    [session.eav],
  );
  const { reading: wiki, pages, error: wikiError } = useEavWikiReading(wikiInput);
  const [wikiTopics, setWikiTopics] = useState<
    Awaited<ReturnType<NonNullable<typeof wikiInput>['topics']>>
  >([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Wiki publications invalidate the Topic projection.
  useEffect(() => {
    let active = true;
    void wikiInput?.topics().then((topics) => {
      if (active) setWikiTopics(topics);
    });
    return () => {
      active = false;
    };
  }, [wikiInput, pages]);
  const wikiPage = pageRoute.match(route.path)?.node;
  const onWiki = !!wikiRoute.match(route.path) || !!wikiPage;
  const onMap = !!mapRoute.match(route.path);
  const mapInput = useMemo(
    () => (session.eav ? applicationMap(session.eav, identities) : null),
    [session.eav, identities],
  );
  const map = useMap(onMap ? mapInput : null);
  const onCalendar = !!calendarRoute.match(route.path);
  const calendarInput = useMemo(
    () => (session.eav ? applicationCalendar(session.eav, identities) : null),
    [session.eav, identities],
  );
  const calendar = useCalendar(calendarInput);
  const [subjectCalendar, setSubjectCalendar] = useState<{
    data: CalendarData;
    page: string;
    source: CalendarData;
  }>();
  useEffect(() => {
    let active = true;
    if (session.eav && wikiPage && calendar.data) {
      const source = calendar.data;
      applicationSubjectCalendar(session.eav, wikiPage, source)
        .then((data) => {
          if (active) setSubjectCalendar({ data, page: wikiPage, source });
        })
        .catch(() => {
          if (active) setSubjectCalendar(undefined);
        });
    }
    return () => {
      active = false;
    };
  }, [session.eav, wikiPage, calendar.data]);
  const onQuestions = !!questionsRoute.match(route.path);
  const graphSubject = graphSubjectRoute.match(route.path)?.node;
  const onGraph = !!graphRoute.match(route.path) || !!graphSubject;
  const graphInput = useMemo(() => (eav ? applicationGraphInput(eav) : null), [eav]);
  const graph = useGraphExplorer(onGraph ? graphInput : null);
  const graphState = useGraph(graph);
  const nativeQuestions = useMemo(
    () => (session.eav ? applicationQuestionCollection(session.eav) : null),
    [session.eav],
  );
  const questions = useQuestionsReading(onWiki || onQuestions ? nativeQuestions : null);
  const questionState = useQuestions(questions);
  // Session identity survives credential reconnects; independent supplied stores get a new owner.
  const fallbackSession = useRef({}).current;
  const chatSession = session.identity ?? eav ?? fallbackSession;
  const writeAdmission = session.credentialPending
    ? 'Wait for the credential update to finish before saving changes.'
    : (writeAvailability(status, !!eav) ??
      (identityState.owner !== setup || !identityState.ready
        ? 'Preparing Vault identities…'
        : undefined));
  const admission = useRef(writeAdmission);
  admission.current = writeAdmission;
  historyAdmission.current = () => writeAdmission;
  const answers = useQuestionAnswers({
    session: chatSession,
    actions: session.eav
      ? applicationQuestionAnswers(session.eav, identities, () =>
          answers.closed() ? 'This Questions session is closed.' : admission.current,
        )
      : null,
    admission: () => (answers.closed() ? 'This Questions session is closed.' : admission.current),
  });
  const answerAvailability = questionAnswerAvailability(questionState, writeAdmission);
  const descriptions = questionDescriptions();
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
  const [coreAction, setCoreAction] = useState<'settings' | 'history' | null>(null);
  const [panel, setPanel] = useState(
    () => layout === 'wide' && localStorage.getItem('vault-panel') === 'agent',
  );
  const showPanel = (open: boolean) => {
    setPanel(open);
    if (open) localStorage.setItem('vault-panel', 'agent');
    else localStorage.removeItem('vault-panel');
  };
  const dismissSupportingTasks = () => {
    closeCoreAction();
    setSearch(false);
    setHelp(false);
    showPanel(false);
  };
  const onSettings = !!settingsRoute.match(route.path);
  const onHistory = !!historyRoute.match(route.path);
  const onChat =
    route.path === '/' ||
    !!chatRoute.match(route.path) ||
    !!conversationRoute.match(route.path) ||
    onSettings ||
    onHistory;
  const activeCoreAction = coreAction ?? (onSettings ? 'settings' : onHistory ? 'history' : null);
  const settingsOpen = activeCoreAction === 'settings';
  const historyOpen = activeCoreAction === 'history';
  const closeCoreAction = () => {
    setCoreAction(null);
    if (onSettings || onHistory) go(chatRoute.href());
  };
  const title = settingsOpen
    ? 'Settings'
    : historyOpen
      ? 'History'
      : onChat
        ? 'Chat'
        : onWiki
          ? (pages?.find((page) => page.id === wikiPage)?.title ?? 'Wiki')
          : onQuestions
            ? 'Questions'
            : onMap
              ? 'Map'
              : onCalendar
                ? 'Calendar'
                : onGraph
                  ? 'Graph'
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
    : (writeAvailability(status, !!eav) ??
      (identityState.owner !== setup || !identityState.ready
        ? identityState.error
          ? `Identity setup failed: ${identityState.error}`
          : 'Preparing Vault identities…'
        : !(suppliedModel ?? remoteModel)
          ? 'Configure an OpenAI key in Settings to send messages.'
          : undefined));
  const conversation = useConversation(
    applicationChatOptions({
      eav: session.eav,
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
      recordsReady: !!eav && recordsReady(status),
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
        if (selected !== id && (selected || path === '/' || chatRoute.match(path)))
          go(conversationRoute.href({ node: id }));
      },
      onNewChat: () => {
        if (conversationRoute.match(parseRoute(location.hash).path)) go(chatRoute.href());
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
        graph.dispose();
        answers.dispose();
        await session.signOut!();
      }
    : null;
  const navigation: Navigation[] = [
    { label: 'Chat', href: chatRoute.href(), icon: 'sparkles', current: onChat },
    { label: 'Wiki', href: wikiRoute.href(), icon: 'book', current: onWiki },
    { label: 'Graph', href: graphRoute.href(), icon: 'network', current: onGraph },
    { label: 'Map', href: mapRoute.href(), icon: 'map', current: onMap },
    { label: 'Calendar', href: calendarRoute.href(), icon: 'calendar', current: onCalendar },
    { label: 'Questions', href: questionsRoute.href(), icon: 'help', current: onQuestions },
    ...(eav
      ? [
          {
            label: 'History',
            href: historyRoute.href(),
            icon: 'history' as const,
            kind: 'action' as const,
            placement: 'status' as const,
            onSelect: () => setCoreAction('history'),
            current: historyOpen,
            expanded: historyOpen,
          },
        ]
      : []),
    {
      label: 'Settings',
      href: settingsRoute.href(),
      icon: 'settings',
      kind: 'action',
      onSelect: () => setCoreAction('settings'),
      current: settingsOpen,
      expanded: settingsOpen,
    },
  ];
  const index = useMemo(
    () => new Map((pages ?? []).map((page) => [page.entry.href, page.entry])),
    [pages],
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
      id: 'go.map',
      label: 'Map',
      group: 'Go to',
      icon: 'map',
      keys: 'g m',
      run: () => go(mapRoute.href()),
    },
    {
      id: 'go.calendar',
      label: 'Calendar',
      group: 'Go to',
      icon: 'calendar',
      keys: 'g c',
      run: () => go(calendarRoute.href()),
    },
    {
      id: 'go.graph',
      label: 'Graph',
      group: 'Go to',
      icon: 'network',
      keys: 'g g',
      run: () => go(graphRoute.href()),
    },
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
    ...(eav
      ? [
          {
            id: 'go.history',
            label: 'History',
            group: 'Application',
            icon: 'history' as const,
            keys: 'g y',
            run: () => setCoreAction('history'),
          },
        ]
      : []),
    {
      id: 'go.settings',
      label: 'Settings',
      group: 'Application',
      icon: 'settings',
      run: () => setCoreAction('settings'),
    },
    {
      id: 'agent.ask',
      label: 'Open Chat',
      group: 'Chat',
      icon: 'sparkles',
      keys: 'mod+j',
      run: () => showPanel(!panel),
    },
    ...(!conversation.continuous && turns.length && selectionAvailability.allowed
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
        signOut={signOut && ((menu) => <SignOut menu={menu} onSignOut={signOut} />)}
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
        ) : onMap ? (
          <MapPage
            data={map.data}
            error={map.error ?? (!mapInput ? 'Map storage is unavailable.' : undefined)}
            actions={mapInput?.actions}
            disabledReason={
              session.credentialPending
                ? 'Wait for credentials to finish updating.'
                : status.kind === 'synced'
                  ? undefined
                  : 'Reconnect before saving Map changes.'
            }
          />
        ) : onCalendar ? (
          <CalendarPage
            data={calendar.data}
            error={
              calendar.error ?? (!calendarInput ? 'Calendar storage is unavailable.' : undefined)
            }
            actions={calendarInput?.actions}
            disabledReason={
              session.credentialPending
                ? 'Wait for credentials to finish updating.'
                : status.kind === 'synced'
                  ? undefined
                  : 'Reconnect before saving Calendar changes.'
            }
          />
        ) : onQuestions ? (
          <QuestionsPage
            state={questionState}
            {...descriptions}
            answers={answers}
            onAnswer={answers.answer}
            disabledReason={answerAvailability}
            transcription={voice}
          />
        ) : onGraph ? (
          <GraphPage
            state={graphState}
            node={graphSubject}
            topics={wikiTopics}
            onRetry={() => later(graph.reload())}
          />
        ) : onWiki ? (
          <Wiki
            key={wikiPage ?? 'wiki'}
            pages={pages}
            node={wikiPage}
            error={wikiError}
            renderRecord={renderWikiRecord}
            renderRelatedRecords={(page) => {
              const related =
                questionState.questions?.filter((question) =>
                  question.subjects.some(
                    (subject) => subject.href === `#/wiki/${encodeURIComponent(page.id)}/`,
                  ),
                ) ?? [];
              return related.length ? (
                <Stack gap="lg">
                  {related.map((question) =>
                    renderWikiRecord({
                      id: question.id,
                      data: question.data,
                      children: [],
                      evidence: [],
                    }),
                  )}
                </Stack>
              ) : null;
            }}
            renderTimeline={() =>
              subjectCalendar &&
              subjectCalendar.page === wikiPage &&
              subjectCalendar.source === calendar.data &&
              (subjectCalendar.data.events.length || subjectCalendar.data.annualDates.length) ? (
                <CalendarTimeline
                  title="Subject timeline"
                  entries={calendarEntries(
                    subjectCalendar.data,
                    new Date().getFullYear(),
                    Intl.DateTimeFormat().resolvedOptions().timeZone,
                  )}
                />
              ) : null
            }
          />
        ) : (
          <Page>
            <Heading level={1}>Not found</Heading>
            <Text>Nothing at {route.path}.</Text>
            <Link href={link(chatRoute.href())}>Open Chat</Link>
          </Page>
        )}
      </Frame>
      <HistoryDrawer open={historyOpen} onClose={closeCoreAction} history={historyView}>
        <RefreshVault status={status} refresh={session.refresh} />
      </HistoryDrawer>
      <SettingsMenu
        open={settingsOpen}
        onClose={closeCoreAction}
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

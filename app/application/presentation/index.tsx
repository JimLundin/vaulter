import { EmbedHostControls } from './EmbedHostControls.tsx';
import { decisionsRoute } from '@/modules/decisions/index.ts';
import { decisionsPage, useDecisions } from '@/modules/decisions/presentation/index.ts';
import { EmbeddedRecord } from './EmbeddedRecord.tsx';
import { historyNavigation, historyCommand } from '@/core/history/presentation/index.tsx';
import { settingsNavigation, settingsCommand } from '@/core/settings/presentation/index.ts';
import { renderPage, pageNavigation, pageCommands } from '@/core/navigation/index.ts';
import { chatPage } from '@/modules/conversation/presentation/index.tsx';
import { questionsPage } from '@/modules/questions/presentation/index.tsx';
import { mapPage } from '@/modules/map/presentation/index.ts';
import { tasksPage, useTasks } from '@/modules/tasks/presentation/index.ts';
import { tasksRoute } from '@/modules/tasks/index.ts';
import { calendarPage } from '@/modules/calendar/presentation/index.ts';
import { graphPage } from '@/modules/graph/presentation/index.ts';
import { wikiPage as wikiPageView } from '@/modules/wiki/presentation/index.tsx';
import { mapRoute } from '@/modules/map/index.ts';
import { useMap } from '@/modules/map/presentation/index.ts';
import { GroupedSettingsMenu } from './SettingsCards.tsx';
import { githubPreferences } from '@/core/persistence/index.ts';
import {
  applicationQuestionCollection,
  applicationQuestionAnswers,
} from '@/application/composition/composition.ts';
import { chatRoute } from '@/modules/conversation/routes.ts';
import { historyRoute } from '@/core/history/routes.ts';
import { settingsRoute } from '@/core/settings/routes.ts';
import { calendarRoute, calendarEntries, type CalendarData } from '@/modules/calendar/index.ts';
import { CalendarTimeline, useCalendar } from '@/modules/calendar/presentation/index.ts';
import {
  applicationHistory,
  applicationChatOptions,
  applicationGraphInput,
  applicationRelationshipCandidates,
  applicationDatabase,
  applicationWiki,
  applicationCalendar,
  applicationDecisions,
  applicationTasks,
  applicationMap,
  applicationSubjectCalendar,
  toolPresentations,
} from '@/application/composition/composition.ts';
// Application shell and module views. Record composition lives in composition.ts.
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranscription, type TranscriptionProvider } from '@/modules/transcription/index.ts';
import type { LanguageModel } from 'ai';
import {
  useVaultSession,
  type OpenJournal,
  VaultGate,
  RefreshVault,
  SessionStatus,
  SignOut,
  createSessionCredentials,
  restrictSessionCredentials,
} from '@/core/session/index.ts';
import { Frame } from './Frame.tsx';
import { Search, Keys } from '@/core/search/presentation/index.ts';
import { Previews } from './Previews.tsx';
import { useKeys } from '@/core/navigation/index.ts';
import { opened } from '@/core/search/index.ts';
import { go, link, parseRoute, useRoute } from '@/core/navigation/index.ts';
import { later } from '@/shared/async/later.ts';
import { agentOptions, agentPreferences } from '@/modules/agent/index.ts';
import {
  createOpenAISettings,
  createOpenAIPreferences,
  openAIOptions,
} from '@/modules/agent/openai/index.ts';
import { chatPreferences, chatSettings } from '@/modules/conversation/index.ts';
import { writeAvailability, recordsReady } from '@/core/session/availability.ts';
import {
  Button,
  Alert,
  AlertDescription,
  Heading,
  Link,
  Overlay,
  Page,
  Row,
  Stack,
  Text,
  setTheme,
  useLayout,
} from '@/shared/ui/kit/index.ts';
import type { Command, Navigation } from '@/core/navigation/index.ts';
import {
  ChatPanel,
  useConversation,
  useChat,
  type Prompt,
} from '@/modules/conversation/presentation/index.tsx';
import {
  createApplicationIdentities,
  defaultIdentities,
  type ApplicationIdentities,
} from '@/application/composition/identities.ts';
import { createOpenAICapabilities } from '@/modules/agent/openai/index.ts';
import { HistoryDrawer } from '@/core/history/presentation/index.tsx';
import type { ForeignRecordRenderer } from '@/modules/wiki/presentation/index.tsx';
import { wikiRoute, pageRoute } from '@/modules/wiki/index.ts';
import { useEavWikiReading } from '@/modules/wiki/index.ts';
import { graphRoute, graphSubjectRoute } from '@/modules/graph/index.ts';
import { useGraph, useGraphExplorer } from '@/modules/graph/index.ts';
import {
  questionsRoute,
  useQuestions,
  useQuestionsReading,
  useQuestionAnswers,
  questionAnswerAvailability,
  questionDescriptions,
  renderQuestionRecord,
} from '@/modules/questions/presentation/index.tsx';

const unavailableModel = () =>
  Promise.reject(new Error('Configure an OpenAI key to send messages.'));
type VaultSession = ReturnType<typeof useVaultSession>;
type SuppliedSession = Omit<
  VaultSession,
  'identity' | 'credentialPending' | 'credentials' | 'updateEndpoint'
> &
  Partial<Pick<VaultSession, 'identity' | 'credentialPending' | 'credentials' | 'updateEndpoint'>>;

export function Application({
  openJournal,
  identities,
}: {
  openJournal: OpenJournal;
  identities?: ApplicationIdentities;
}) {
  const session = useVaultSession(openJournal);
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
    settingsVariant?: 'cards' | 'compact';
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
  const githubValues = useSyncExternalStore(
    githubPreferences.subscribe,
    githubPreferences.snapshot,
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
  const onDecisions = !!decisionsRoute.match(route.path);
  const decisionsInput = useMemo(
    () => (session.eav ? applicationDecisions(session.eav, identities) : null),
    [session.eav, identities],
  );
  const decisions = useDecisions(onDecisions ? decisionsInput : null);
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
  const candidateActions = useMemo(
    () =>
      session.eav
        ? applicationRelationshipCandidates(session.eav, identities, () => admission.current)
        : undefined,
    [session.eav, identities],
  );
  historyAdmission.current = () => writeAdmission;
  const onTasks = !!tasksRoute.match(route.path);
  const tasksInput = useMemo(
    () => (session.eav ? applicationTasks(session.eav, identities, () => admission.current) : null),
    [session.eav, identities],
  );
  const tasks = useTasks(onTasks ? tasksInput : null);
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
  const embedDatabase = useMemo(() => (eav ? applicationDatabase(eav) : null), [eav]);
  const renderWikiRecord: ForeignRecordRenderer = (record) =>
    record.embed ? (
      <EmbeddedRecord database={embedDatabase} embed={record.embed} cutoff={record.embedCutoff} />
    ) : (
      renderQuestionRecord(record, questionState, {
        ...descriptions,
        answers,
        onAnswer: answers.answer,
        disabledReason: writeAdmission,
        transcription: voice,
      })
    );
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
  const onChat = route.path === '/' || !!chatRoute.match(route.path) || onSettings || onHistory;
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
              : onDecisions
                ? 'Decisions'
                : onCalendar
                  ? 'Calendar'
                  : onTasks
                    ? 'Tasks'
                    : onGraph
                      ? 'Graph'
                      : 'Not found';
  const provider = useMemo(
    () =>
      session.secrets?.openai
        ? createOpenAICapabilities({
            apiKey: session.secrets.openai,
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
      recordsReady: !!eav && recordsReady(status),
      onReadOutcome: (outcome) => {
        if (
          (outcome.status === 'blocked' || outcome.status === 'failed') &&
          parseRoute(location.hash).path === route.path
        )
          go(chatRoute.href());
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
  const { capture } = useChat(conversation);
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
    ...pageNavigation(route.path === '/' ? chatRoute.href() : route.path, [
      chatPage,
      wikiPageView,
      graphPage,
      mapPage,
      calendarPage,
      decisionsPage,
      tasksPage,
      questionsPage,
    ]),
    ...(eav ? [historyNavigation(historyOpen, () => setCoreAction('history'))] : []),
    settingsNavigation(settingsOpen, () => setCoreAction('settings')),
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
    ...pageCommands([
      mapPage,
      calendarPage,
      decisionsPage,
      tasksPage,
      graphPage,
      wikiPageView,
      chatPage,
      questionsPage,
    ]),
    ...(eav ? [historyCommand(() => setCoreAction('history'))] : []),
    settingsCommand(() => setCoreAction('settings')),
    {
      id: 'agent.ask',
      label: 'Open Chat',
      group: 'Chat',
      icon: 'sparkles',
      keys: 'mod+j',
      run: () => showPanel(!panel),
    },
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
            embedControls={
              embedDatabase && (
                <EmbedHostControls
                  database={embedDatabase}
                  user={identities.user}
                  disabledReason={conversation.readAvailability().reason ?? writeAdmission}
                  onSaved={() => conversation.reload()}
                />
              )
            }
            renderEmbed={(embed) => <EmbeddedRecord database={embedDatabase} embed={embed} />}
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
        {renderPage(
          onSettings || onHistory ? chatRoute.href() : route.path,
          [
            chatPage.mount({
              conversation,
              prompt,
              toolPresentations,
              embedControls: embedDatabase && (
                <EmbedHostControls
                  database={embedDatabase}
                  user={identities.user}
                  disabledReason={conversation.readAvailability().reason ?? writeAdmission}
                  onSaved={() => conversation.reload()}
                />
              ),
              renderEmbed: (embed) => <EmbeddedRecord database={embedDatabase} embed={embed} />,
            }),
            mapPage.mount({
              data: map.data,
              error: map.error ?? (!mapInput ? 'Map storage is unavailable.' : undefined),
              actions: mapInput?.actions,
              disabledReason: session.credentialPending
                ? 'Wait for credentials to finish updating.'
                : status.kind === 'synced'
                  ? undefined
                  : 'Reconnect before saving Map changes.',
            }),
            decisionsPage.mount({
              data: decisions.data,
              error:
                decisions.error ??
                (!decisionsInput ? 'Decisions storage is unavailable.' : undefined),
              actions: decisionsInput?.actions,
              disabledReason: session.credentialPending
                ? 'Wait for credentials to finish updating.'
                : status.kind === 'synced'
                  ? undefined
                  : 'Reconnect before saving Decisions changes.',
            }),
            tasksPage.mount({
              data: tasks.data,
              error: tasks.error ?? (!tasksInput ? 'Tasks storage is unavailable.' : undefined),
              actions: tasksInput?.actions,
              disabledReason: writeAdmission,
            }),
            calendarPage.mount({
              data: calendar.data,
              error:
                calendar.error ?? (!calendarInput ? 'Calendar storage is unavailable.' : undefined),
              actions: calendarInput?.actions,
              disabledReason: session.credentialPending
                ? 'Wait for credentials to finish updating.'
                : status.kind === 'synced'
                  ? undefined
                  : 'Reconnect before saving Calendar changes.',
            }),
            questionsPage.mount({
              state: questionState,
              ...descriptions,
              answers,
              onAnswer: answers.answer,
              disabledReason: answerAvailability,
              transcription: voice,
            }),
            graphPage.mount({
              state: graphState,
              candidateActions,
              candidateDisabledReason: writeAdmission,
              node: graphSubject,
              topics: wikiTopics,
              onRetry: () => later(graph.reload()),
            }),
            wikiPageView.mount(
              {
                pages,
                node: wikiPage,
                error: wikiError,
                renderRecord: renderWikiRecord,
                renderEmbedControls: (page) =>
                  embedDatabase && (
                    <EmbedHostControls
                      key={page.id}
                      database={embedDatabase}
                      user={identities.user}
                      page={page}
                      disabledReason={writeAdmission}
                    />
                  ),
                renderRelatedRecords: (page) => {
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
                },
                renderTimeline: () =>
                  subjectCalendar &&
                  subjectCalendar.page === wikiPage &&
                  subjectCalendar.source === calendar.data &&
                  (subjectCalendar.data.events.length ||
                    subjectCalendar.data.annualDates.length) ? (
                    <CalendarTimeline
                      title="Subject timeline"
                      entries={calendarEntries(
                        subjectCalendar.data,
                        new Date().getFullYear(),
                        Intl.DateTimeFormat().resolvedOptions().timeZone,
                      )}
                    />
                  ) : null,
              },
              wikiPage ?? 'wiki',
            ),
          ],
          <Page>
            <Heading level={1}>Not found</Heading>
            <Text>Nothing at {route.path}.</Text>
            <Link href={link(chatRoute.href())}>Open Chat</Link>
          </Page>,
        )}
      </Frame>
      <HistoryDrawer open={historyOpen} onClose={closeCoreAction} history={historyView}>
        <RefreshVault status={status} refresh={session.refresh} />
      </HistoryDrawer>
      <GroupedSettingsMenu
        open={settingsOpen}
        onClose={closeCoreAction}
        stores={{
          provider: providerDefinition,
          openai: providerPreferences,
          agent: agentPreferences,
          chat: chatPreferences,
        }}
        chatDefinition={chatSettings}
        credentials={credentials}
        githubEndpoint={githubValues.api ?? ''}
        saveGitHubEndpoint={
          session.updateEndpoint ?? (async (value) => githubPreferences.set('api', value))
        }
        variant={preview?.settingsVariant}
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

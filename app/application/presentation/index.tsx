import { decisionsRoute } from '@/modules/decisions/index.ts';
import { decisionsPage, useDecisions } from '@/modules/decisions/presentation/index.ts';
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
  applicationDatabase,
  applicationWiki,
  applicationCalendar,
            tasksPage.mount({
              data: tasks.data,
              error: tasks.error ?? (!tasksInput ? 'Tasks storage is unavailable.' : undefined),
              actions: tasksInput?.actions,
              disabledReason: writeAdmission,

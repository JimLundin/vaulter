import { seedDecisions } from './decision-records.ts';
import { seedEavQuestions } from './question-records.ts';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '@/shared/ui/kit/styles.css';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { DesignComparison } from '@/shared/ui/kit/index.ts';
import { OpenApplication } from '@/application/presentation/index.tsx';
import { applicationWiki } from '@/application/composition/composition.ts';
import {
  startTheme,
  Text,
  DesignPreview,
  Gate,
  Brand,
  Button,
  Stack,
} from '@/shared/ui/kit/index.ts';
import { seedGraphEvidence } from './graph-evidence.ts';
import { seedGraphDensity } from './graph-density.ts';
import { previewModel } from './model.ts';
import { createOpenAICapabilities } from '@/modules/agent/openai/index.ts';
import { recordedTranscription } from '@/modules/agent/recorded-transcription.ts';
import { previewTranscription } from './transcription.ts';
import { previewEav, previewEavKey } from './eav.ts';
import { seedEavWiki } from './wiki-records.ts';
import { seedMap } from './map-records.ts';
import { seedTasks } from './task-records.ts';
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
  await seedTasks(db);

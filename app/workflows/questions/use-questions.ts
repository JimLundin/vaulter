import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import type { NodeStore } from '../../vault/nodes/store.ts';
import { createQuestionsReading, type QuestionsReading } from './reading.ts';
import {
  createQuestionAnswers,
  type QuestionAnswers,
  type QuestionAnswersOptions,
  type QuestionAnswersState,
} from './answers.ts';

const noAttempts: QuestionAnswersState = { attempts: [] };
const emptyAnswers = () => noAttempts;
const unsubscribeAnswers = () => () => undefined;

/** Views observe retained work; their mounting and local drafts do not own publication. */
export function useQuestionAnswerState(answers?: QuestionAnswers) {
  return useSyncExternalStore(
    answers?.subscribe ?? unsubscribeAnswers,
    answers?.snapshot ?? emptyAnswers,
    answers?.snapshot ?? emptyAnswers,
  );
}

export const useQuestions = (reading: QuestionsReading) =>
  useSyncExternalStore(reading.subscribe, reading.snapshot);

export function useQuestionsReading(nodes: NodeStore | null): QuestionsReading {
  const [lifetime, setLifetime] = useState(() => ({
    nodes,
    reading: createQuestionsReading(nodes),
  }));
  let current = lifetime;
  if (lifetime.nodes !== nodes) {
    current = { nodes, reading: createQuestionsReading(nodes) };
    setLifetime(current);
  }
  const { reading } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the input scope owns the lifetime; effect replay replaces its disposed reader.
  useLayoutEffect(() => {
    const owned = reading.closed() ? createQuestionsReading(nodes) : reading;
    if (owned !== reading) setLifetime({ nodes, reading: owned });
    owned.start();
    return () => owned.dispose();
  }, [nodes]);
  return reading;
}

/** Answer publication belongs to the application session, independently of the visible reading route. */
export function useQuestionAnswers(options: QuestionAnswersOptions) {
  const { session } = options;
  const [lifetime, setLifetime] = useState(() => ({
    session,
    answers: createQuestionAnswers(options),
  }));
  let current = lifetime;
  if (lifetime.session !== session) {
    current = { session, answers: createQuestionAnswers(options) };
    setLifetime(current);
  }
  const { answers } = current;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the application session owns lifetime; capability changes configure it separately.
  useLayoutEffect(() => {
    const owned = answers.closed() ? createQuestionAnswers(options) : answers;
    if (owned !== answers) setLifetime({ session, answers: owned });
    return () => owned.dispose();
  }, [session]);
  useLayoutEffect(() => {
    answers.configure(options);
  }, [answers, options]);
  return answers;
}

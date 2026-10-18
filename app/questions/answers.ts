import { SaveError } from '@/application/store/index.ts';

import type { Question } from './reading.ts';

export type QuestionAnswerHandler = (question: Question, text: string) => Promise<void>;

export interface QuestionAnswersOptions {
  /** Navigation and capability replacement retain this application session's task owner. */
  readonly session: object;
  readonly actions: { readonly answer: QuestionAnswerHandler } | null;
  readonly availability?: string;
  /** Consult current session admission again after asynchronous reads and before publication. */
  readonly admission?: () => string | undefined;
}

export interface QuestionAnswers {
  readonly answer: QuestionAnswerHandler;
  /** Retry the retained request without asking a mounted view to reconstruct its text or identity. */
  readonly retry: (question: string) => Promise<void>;
  readonly snapshot: () => QuestionAnswersState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly configure: (options: QuestionAnswersOptions) => void;
  readonly closed: () => boolean;
  readonly dispose: () => void;
}

export interface QuestionAnswerAttempt {
  readonly question: Question;
  readonly text: string;
  readonly phase: 'pending' | 'uncertain';
  readonly error?: string;
}

export interface QuestionAnswersState {
  readonly attempts: readonly QuestionAnswerAttempt[];
}

interface AnswerTask {
  readonly question: Question;
  readonly text: string;
  retrySave?: () => Promise<unknown>;
  pending?: Promise<void>;
  error?: string;
}

/** Questions retains admitted Answers and exact-save recovery across view lifetimes. */
export function createQuestionAnswers(initial: QuestionAnswersOptions): QuestionAnswers {
  let options = initial;
  let disposed = false;
  const tasks = new Map<string, AnswerTask>();
  let state: QuestionAnswersState = Object.freeze({ attempts: [] });
  const listeners = new Set<() => void>();
  const publish = () => {
    state = Object.freeze({
      attempts: [...tasks.values()].map((task) => ({
        question: task.question,
        text: task.text,
        phase: task.pending ? ('pending' as const) : ('uncertain' as const),
        ...(task.error ? { error: task.error } : {}),
      })),
    });
    for (const listener of listeners) listener();
  };
  const available = () => {
    if (disposed) throw new Error('This Questions session is closed.');
    if (options.availability) throw new Error(options.availability);
    const reason = options.admission?.();
    if (reason) throw new Error(reason);
    if (!options.actions) throw new Error('Questions storage is unavailable.');
    return options.actions;
  };
  const run = async (task: AnswerTask) => {
    const actions = available();
    try {
      if (task.retrySave) await task.retrySave();
      else await actions.answer(task.question, task.text);
    } catch (error) {
      if (error instanceof SaveError) task.retrySave = error.retry;
      throw error;
    }
  };
  const answer: QuestionAnswerHandler = (question, text) => {
    try {
      available();
    } catch (error) {
      return Promise.reject(error);
    }
    const trimmed = text.trim();
    const existing = tasks.get(question.id);
    if (
      existing &&
      ((!existing.retrySave &&
        existing.question.evidence.transaction !== question.evidence.transaction) ||
        existing.text !== trimmed)
    )
      return Promise.reject(
        new Error('Finish retrying the original answer before saving a different answer.'),
      );
    const task: AnswerTask = existing ?? {
      question,
      text: trimmed,
    };
    if (task.pending !== undefined) return task.pending;
    tasks.set(question.id, task);
    task.error = undefined;
    const pending = run(task)
      .then(() => {
        if (tasks.get(question.id) === task) tasks.delete(question.id);
      })
      .catch((error: unknown) => {
        // Preparation never published. A conflict is also a definitive rejection, so new wording may be read.
        if (!task.retrySave && tasks.get(question.id) === task) tasks.delete(question.id);
        else task.error = error instanceof Error ? error.message : String(error);
        throw error;
      })
      .finally(() => {
        task.pending = undefined;
        publish();
      });
    task.pending = pending;
    publish();
    return pending;
  };
  return {
    answer,
    retry: (id) => {
      const task = tasks.get(id);
      return task
        ? answer(task.question, task.text)
        : Promise.reject(new Error('There is no retained answer to retry.'));
    },
    snapshot: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    configure: (next) => {
      if (disposed) return;
      if (initial.session !== next.session) {
        disposed = true;
        listeners.clear();
        return;
      }
      options = next;
    },
    closed: () => disposed,
    dispose: () => {
      disposed = true;
      listeners.clear();
    },
  };
}

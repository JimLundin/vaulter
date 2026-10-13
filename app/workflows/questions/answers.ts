import { frozen } from '../../vault/nodes/json.ts';
import { NodeConflict, NodePublicationRejected } from '../../vault/nodes/history.ts';
import type { NodeCommit, NodeStore } from '../../vault/nodes/store.ts';
import type { QuestionAnswerHandler } from './QuestionItem.tsx';
import { createQuestionOwnership } from './actions.ts';
import type { Question } from './reading.ts';

export interface QuestionAnswersOptions {
  /** Navigation and capability replacement retain this application session's task owner. */
  readonly session: object;
  readonly nodes: NodeStore | null;
  /** Supplied by the trusted application, never chosen by an Answer's text or record. */
  readonly recordedBy: string;
  readonly availability?: string;
  /** Consult current session admission again after asynchronous reads and before publication. */
  readonly admission?: () => string | undefined;
  /** The application supplies the same owner used by its publication checks. */
  readonly ownership?: ReturnType<typeof createQuestionOwnership>;
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
  /** Retain the whole request after entering publication: retries never generate another Answer. */
  request?: NodeCommit;
  entered?: boolean;
  pending?: Promise<void>;
  error?: string;
}

/** Questions owns fresh reads, retained relationship discovery and exact-request Answer publication. */
export function createQuestionAnswers(initial: QuestionAnswersOptions): QuestionAnswers {
  let options = initial;
  let disposed = false;
  const tasks = new Map<string, AnswerTask>();
  let state: QuestionAnswersState = frozen({ attempts: [] });
  const listeners = new Set<() => void>();
  const publish = () => {
    state = frozen({
      attempts: [...tasks.values()].map((task) => ({
        question: task.question,
        text: task.text,
        phase: task.pending ? 'pending' : 'uncertain',
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
    if (!options.nodes) throw new Error('Node store is unavailable.');
    return options.nodes;
  };
  const run = async (task: AnswerTask) => {
    const nodes = available();
    const { recordedBy } = options;
    if (!task.request) {
      const view = await nodes.snapshot();
      const ownership = options.ownership ?? createQuestionOwnership({ nodes });
      const prepared = await ownership.answer(
        view,
        { question: task.question.key, text: task.text },
        { kind: 'person', recordedBy, origin: task.question.id },
      );
      // Admission can change while history is read; disposal prevents publication that has not begun.
      if (available() !== nodes)
        throw new Error('The node store changed. Review the question before saving an answer.');
      task.request = frozen({
        ...prepared,
        recordedBy,
        origin: task.question.id,
        undoOf: null,
      });
    }
    available();
    // An entered commit remains accountable even when navigation or session cleanup follows it.
    task.entered = true;
    await nodes.commit(task.request);
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
      ((!existing.entered && existing.question.key.transaction !== question.key.transaction) ||
        existing.text !== trimmed)
    )
      return Promise.reject(
        new Error('Finish retrying the original answer before saving a different answer.'),
      );
    const task: AnswerTask = existing ?? { question, text: trimmed };
    if (task.pending !== undefined) return task.pending;
    tasks.set(question.id, task);
    task.error = undefined;
    const pending = run(task)
      .then(() => {
        if (tasks.get(question.id) === task) tasks.delete(question.id);
      })
      .catch((error: unknown) => {
        // Preparation never published. A conflict is also a definitive rejection, so new wording may be read.
        if (
          (!task.entered ||
            error instanceof NodeConflict ||
            error instanceof NodePublicationRejected) &&
          tasks.get(question.id) === task
        )
          tasks.delete(question.id);
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

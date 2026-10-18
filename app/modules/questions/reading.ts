import type { HistoricalReference } from '@/core/store/index.ts';
import type { QuestionData } from './suggestions.ts';

export interface QuestionTarget {
  readonly evidence: HistoricalReference;
  readonly text?: string;
  readonly label?: string;
  readonly href?: string;
  readonly state: 'available' | 'newer' | 'deleted';
}
export interface QuestionAttribution {
  readonly transaction: string;
  readonly at: string;
  readonly author?: HistoricalReference;
  readonly origin?: HistoricalReference;
}
export interface Question {
  readonly id: string;
  readonly evidence: HistoricalReference;
  readonly data: QuestionData;
  readonly status: 'open' | 'answered' | 'abandoned';
  readonly subjects: readonly QuestionTarget[];
  readonly answers: readonly QuestionTarget[];
  readonly sources?: readonly QuestionTarget[];
  readonly knowledge?: readonly QuestionTarget[];
  readonly reviews?: readonly QuestionTarget[];
  readonly created?: QuestionAttribution;
  readonly updated?: QuestionAttribution;
}

export interface QuestionsReadingState {
  readonly questions: readonly Question[] | null;
  readonly loading: boolean;
  readonly error?: string;
}
export interface QuestionsReading {
  readonly start: () => void;
  readonly reload: () => Promise<void>;
  readonly snapshot: () => QuestionsReadingState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly closed: () => boolean;
  readonly dispose: () => void;
}

/** Own the shared collection and its subscription; callers supply the store lifetime. */
export interface QuestionCollection {
  readonly collection: () => Promise<Question[]>;
  readonly subscribe: (listener: () => void) => () => void;
}

export function createQuestionsReading(source: QuestionCollection | null): QuestionsReading {
  let state: QuestionsReadingState = { questions: null, loading: !!source };
  let generation = 0;
  let disposed = false;
  let started = false;
  let unsubscribe: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: QuestionsReadingState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const reload = async () => {
    if (disposed || !source) return;
    const request = ++generation;
    publish({ ...state, loading: true, error: undefined });
    try {
      const questions = await source.collection();
      if (!disposed && request === generation) publish({ questions, loading: false });
    } catch (error) {
      if (!disposed && request === generation)
        publish({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };
  const load = () => {
    reload().catch((error: unknown) => {
      if (!disposed)
        publish({
          ...state,
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        });
    });
  };
  return {
    start: () => {
      if (disposed || started) return;
      started = true;
      if (source) unsubscribe = source.subscribe(load);
      load();
    },
    reload,
    snapshot: () => state,
    subscribe: (listener) => {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    closed: () => disposed,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation++;
      unsubscribe?.();
      listeners.clear();
    },
  };
}

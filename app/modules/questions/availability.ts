import type { QuestionsReadingState } from './reading.ts';

/** Read failures and refreshing disable both collection and embedded Answer views. */
export function questionAnswerAvailability(state: QuestionsReadingState, admission?: string) {
  return (
    admission ||
    (state.error
      ? 'Refresh questions before saving an answer.'
      : state.loading
        ? 'Refreshing questions…'
        : undefined)
  );
}

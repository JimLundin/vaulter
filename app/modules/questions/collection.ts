import { bindActor, readActorBinding } from '@/modules/actors/index.ts';
import { SaveError } from '@/core/store/index.ts';
import type { QuestionDatabase } from './records.ts';
import type { Question } from './reading.ts';
import { readEavQuestions } from './projection.ts';
import { questionActions } from './operations.ts';

/** Subscription lifetime stays with the Question collection rather than its caller. */
export function questionCollection(database: () => Promise<QuestionDatabase>) {
  return {
    collection: () => database().then(readEavQuestions),
    subscribe: (listener: () => void) => {
      let disposed = false;
      let unsubscribe: (() => void) | undefined;
      database()
        .then((db) => {
          if (!disposed) unsubscribe = db.subscribe(listener);
        })
        .catch(listener);
      return () => {
        disposed = true;
        unsubscribe?.();
      };
    },
  };
}

/** Direct Answers retain readiness, attribution and exact publication recovery. */
export function questionAnswerActions(input: {
  database: () => Promise<QuestionDatabase>;
  user: string;
  admission: () => string | undefined;
}) {
  const check = () => {
    const reason = input.admission();
    if (reason) throw new Error(reason);
  };
  const answer = async (question: Question, text: string): Promise<void> => {
    check();
    if (!question.evidence) throw new Error('Question has no native EAV address.');
    const db = await input.database();
    let actor = await readActorBinding(db, input.user, 'user');
    if (!actor) {
      try {
        await db.transaction(async (tx) => {
          check();
          await bindActor(tx, input.user, 'user', 'Vault owner');
          check();
        });
      } catch (error) {
        if (error instanceof SaveError) {
          throw new SaveError(error.message, async () => {
            await error.retry();
            await answer(question, text);
          });
        }
        throw error;
      }
      actor = await readActorBinding(db, input.user, 'user');
    }
    if (!actor) throw new Error('Preparing Vault identities…');
    await questionActions(db, { author: actor }, undefined, check).answer(question.evidence, text);
  };
  return { answer };
}

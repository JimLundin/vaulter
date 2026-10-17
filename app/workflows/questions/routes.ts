import { pattern } from '@/navigation/routing.ts';

const collection = pattern('/questions/');
const formerDetail = pattern('/questions/:key/');

/** Retained links to individual questions now open the collection too. */
export const questionsRoute = {
  ...collection,
  match: (path: string) => collection.match(path) ?? (formerDetail.match(path) ? {} : null),
};

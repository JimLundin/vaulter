// Questions owns the identities shared by executable tools and recorded receipt presentation.
export const questionToolActions = {
  ask: 'askQuestion',
  read: 'readQuestion',
  list: 'listQuestions',
} as const;
export const questionEnabledTools = Object.values(questionToolActions).map((name) => ({ name }));

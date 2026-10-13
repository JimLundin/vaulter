// Content owns the identities shared by executable tools and recorded receipt presentation.
export const contentToolActions = {
  create: 'createNode',
  read: 'readNode',
  update: 'updateNode',
} as const;
export const contentEnabledTools = Object.values(contentToolActions).map((name) => ({ name }));

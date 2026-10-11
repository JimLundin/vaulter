// What a migration run found: written to its summary for review.

export const report = {
  skippedCommits: [] as string[],
  unsupported: {} as Record<string, number>,
  unknownFields: {} as Record<string, number>,
  abandoned: [] as { question: string; page: string }[],
  tasks: [] as { task: string; page: string; status: string }[],
  merged: [] as { page: string; into: string }[],
  removedPages: [] as string[],
  weatherWithoutPlace: [] as string[],
  textMismatches: [] as string[],
  invalidValues: [] as string[],
  unresolvedAtHead: [] as { node: string; ref: unknown; label: unknown }[],
};
export const tally = (bucket: Record<string, number>, key: string) => {
  bucket[key] = (bucket[key] ?? 0) + 1;
};

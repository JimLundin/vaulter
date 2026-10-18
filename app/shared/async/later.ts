// Starts work nobody waits for (an effect, a click), and reports a failure instead of losing it.
export const later = (p: Promise<unknown>) => {
  p.catch((e: unknown) => reportError(e));
};

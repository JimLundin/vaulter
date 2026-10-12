// Give the browser an event-loop turn during CPU-heavy history loading. A resolved
// Promise alone would only yield to microtasks and keep input/rendering blocked.
export function loadingTurns() {
  let count = 0;
  let started = performance.now();
  return () => {
    count++;
    if (count < 32 && performance.now() - started < 8) return;
    count = 0;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        started = performance.now();
        resolve();
      }, 0);
    });
  };
}

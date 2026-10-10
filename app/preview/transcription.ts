// A visibly scripted voice demo: no microphone permission, audio capture or external requests.

const TEXT =
  'Leave space for a walk before work, and keep an afternoon free for the garden studio.';
export const previewTranscription = (
  events: { text: (text: string) => void },
  signal: AbortSignal,
) => {
  const words = TEXT.split(' ');
  let count = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const close = () => {
    clearInterval(timer);
    signal.removeEventListener('abort', close);
  };
  signal.addEventListener('abort', close, { once: true });
  timer = setInterval(() => {
    if (signal.aborted) {
      close();
      return;
    }
    count = Math.min(count + 1, words.length);
    events.text(words.slice(0, count).join(' '));
    if (count === words.length) clearInterval(timer);
  }, 280);
  return Promise.resolve({
    close,
    finish: () => {
      close();
      return Promise.resolve(words.slice(0, count).join(' '));
    },
  });
};

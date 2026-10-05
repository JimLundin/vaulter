// One kernel at a time: two tabs running it would share the same IndexedDB with listeners that never
// hear of each other's changes. The kernel holds a Web Lock while it runs; a second tab waits on a bare
// screen until the person moves Vaulter there, when the first tab stops its extensions and lets go.
import { h, root } from './dom.ts';

const LOCK = 'vaulter-kernel';
const TAKE_OVER = 'take-over';

export interface TabDeps {
  locks: LockManager;
  channel: () => BroadcastChannel;
}

const browser = (): TabDeps => ({
  locks: navigator.locks,
  channel: () => new BroadcastChannel('vaulter-kernel'),
});

export function singleTab(deps: TabDeps = browser()) {
  let release: (() => void) | undefined;
  const channel = deps.channel();
  const hold = () =>
    new Promise<void>((r) => {
      release = r;
    });

  return {
    /** Takes the kernel for this tab if no other tab has it. */
    claim: () =>
      new Promise<boolean>((ok) => {
        void deps.locks.request(LOCK, { ifAvailable: true }, (lock) => {
          ok(lock !== null);
          return lock ? hold() : undefined;
        });
      }),

    /** Asks the tab that has the kernel to hand it over; resolves once this tab has it. */
    takeOver: () =>
      new Promise<void>((ok) => {
        void deps.locks.request(LOCK, () => {
          ok();
          return hold();
        });
        channel.postMessage(TAKE_OVER);
      }),

    /** In the tab that has the kernel: when another asks, `stop`, then let go. */
    onTakeOver(stop: () => unknown) {
      channel.onmessage = async (e: MessageEvent) => {
        if (e.data !== TAKE_OVER || !release) return;
        await stop();
        const r = release;
        release = undefined;
        r();
      };
    },

    close() {
      release?.();
      channel.close();
    },
  };
}

export type SingleTab = ReturnType<typeof singleTab>;

/** The bare screen in a tab without the kernel; resolves when the person moves Vaulter here. */
export function standbyScreen(tab: SingleTab, moved = false): Promise<void> {
  return new Promise((done) => {
    const text = h(
      'p',
      { style: 'margin:0' },
      moved ? 'Vaulter moved to another tab.' : 'Vaulter is open in another tab.',
    );
    const button = h('button', { type: 'button' }, 'Use it here');
    button.onclick = () => {
      text.textContent = 'Moving…';
      void tab.takeOver().then(done);
    };
    root().replaceChildren(
      h(
        'div',
        {
          style:
            'max-width:24rem;margin:20vh auto;display:grid;gap:.75rem;font:15px/1.5 system-ui,sans-serif',
        },
        h('h1', { style: 'margin:0;font-size:1.3rem' }, 'Vaulter'),
        text,
        button,
      ),
    );
  });
}

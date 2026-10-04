// The shell, one for every screen size for now (the design has shell-mobile and shell-desktop; they
// can split once the two differ by more than CSS). It renders into #pip and draws what others add.
import { defineExtension, perCaller } from '@pip/kernel';
import { type ShellV1, shell, slots } from '@contracts/ui.shell';
import { createRoot } from 'react-dom/client';
import { registry } from './registry.ts';
import { Shell } from './Shell.tsx';
import { css } from './style.ts';

export default defineExtension({
  id: 'shell',
  version: '1.0.0',
  provides: { shell },
  agentGuide: 'The frame: Pip opens a view by navigating to its route.',
  setup() {
    const r = registry();
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    const root =
      document.getElementById('pip') ?? document.body.appendChild(document.createElement('div'));
    createRoot(root).render(<Shell registry={r} />);

    return {
      shell: perCaller<ShellV1>((from) => ({
        slots,
        addView: (view) => r.addView(view, from),
        addAction: (action) => r.addAction(action, from),
        navigate: (path) => {
          location.hash = path;
        },
        toast: (message) => r.toast(message),
      })),
    };
  },
});

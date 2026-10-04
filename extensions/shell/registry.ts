// What extensions have added to the shell, with who added each, and a subscription for React.
import type { Action, View } from '@contracts/ui.shell';

export interface Added<T> {
  item: T;
  /** The extension that added it: the source label. */
  from: string;
}

export function registry() {
  let views: Added<View>[] = [];
  let actions: Added<Action>[] = [];
  let toasts: { id: number; message: string }[] = [];
  const subs = new Set<() => void>();
  const changed = () => {
    for (const s of subs) s();
  };
  let n = 0;
  return {
    subscribe(f: () => void) {
      subs.add(f);
      return () => subs.delete(f);
    },
    views: () => views,
    actions: () => actions,
    toasts: () => toasts,
    addView(item: View, from: string) {
      const added = { item, from };
      views = [...views, added];
      changed();
      return () => {
        views = views.filter((v) => v !== added);
        changed();
      };
    },
    addAction(item: Action, from: string) {
      const added = { item, from };
      actions = [...actions, added];
      changed();
      return () => {
        actions = actions.filter((a) => a !== added);
        changed();
      };
    },
    toast(message: string) {
      const id = ++n;
      toasts = [...toasts, { id, message }];
      changed();
      setTimeout(() => {
        toasts = toasts.filter((t) => t.id !== id);
        changed();
      }, 3000);
    },
  };
}
export type Registry = ReturnType<typeof registry>;

/** The view for a path and its parameters: the most specific route wins (`/wiki/new` over `/wiki/:id`). */
export function match(views: Added<View>[], path: string) {
  const parts = path.split('/').filter(Boolean);
  let best: { view: Added<View>; params: Record<string, string>; score: number } | undefined;
  for (const v of views) {
    const route = v.item.route.split('/').filter(Boolean);
    if (route.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    const ok = route.every((r, i) => {
      if (r.startsWith(':')) {
        params[r.slice(1)] = decodeURIComponent(parts[i]);
        return true;
      }
      score++;
      return r === parts[i];
    });
    if (ok && (!best || score > best.score)) best = { view: v, params, score };
  }
  return best;
}

/** Whether a key event is `keys` ("n", "mod+k"). */
export function pressed(e: KeyboardEvent, keys: string) {
  const want = keys.toLowerCase().split('+');
  const key = want.pop();
  const mod = want.includes('mod');
  return e.key.toLowerCase() === key && (e.metaKey || e.ctrlKey) === mod && !e.altKey;
}

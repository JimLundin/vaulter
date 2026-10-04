// The frame: navigation (a sidebar on a wide screen, a bottom bar on a phone), the page with its title
// and toolbar, and toasts. Every view carries a label naming the extension that added it.
import { Component, type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { match, pressed, type Registry } from './registry.ts';

const useRegistry = <T,>(r: Registry, read: () => T) => useSyncExternalStore(r.subscribe, read);

export const pathOf = () => location.hash.replace(/^#/, '') || '/';
const usePath = () =>
  useSyncExternalStore((f) => {
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, pathOf);

export function Shell({ registry }: { registry: Registry }) {
  const views = useRegistry(registry, registry.views);
  const actions = useRegistry(registry, registry.actions);
  const toasts = useRegistry(registry, registry.toasts);
  const path = usePath();

  const nav = views.filter((v) => v.item.nav).sort((a, b) => a.item.nav!.order - b.item.nav!.order);
  // "/" is the first page in the navigation.
  const found = match(views, path === '/' && nav[0] ? nav[0].item.route : path);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.closest('input, textarea, select, [contenteditable]');
      for (const { item } of actions)
        if (item.keys && pressed(e, item.keys) && (!typing || item.keys.includes('mod+'))) {
          e.preventDefault();
          void item.run();
          return;
        }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [actions]);

  const inSlot = (slot: string) =>
    actions
      .filter((a) => a.item.slot === slot)
      .map(({ item, from }) => (
        <button
          key={`${from}/${item.id}`}
          type="button"
          data-slot={slot}
          title={`${item.label}${item.keys ? ` (${item.keys})` : ''} · from ${from}`}
          onClick={() => void item.run()}
        >
          {item.label}
        </button>
      ));

  const View = found?.view.item.component;
  return (
    <div className="pip-frame">
      <nav className="pip-nav">
        <a className="pip-brand" href="#/">
          Vaulter
        </a>
        {nav.map(({ item }) => (
          <a
            key={item.id}
            href={`#${item.route}`}
            aria-current={found?.view.item === item ? 'page' : undefined}
          >
            {item.nav!.label}
          </a>
        ))}
        <span className="pip-primary">{inSlot('primary')}</span>
        <a className="pip-safe" href="?safe">
          Safe mode
        </a>
      </nav>
      <main className="pip-page">
        {found && View ? (
          <>
            <header>
              <h1>{found.view.item.title}</h1>
              <span className="pip-toolbar">{inSlot('toolbar')}</span>
            </header>
            <Boundary key={path} from={found.view.from}>
              <View params={found.params} />
            </Boundary>
            <footer className="pip-source">from {found.view.from}</footer>
          </>
        ) : (
          <p>Nothing here. {views.length === 0 && 'No extension has added a page yet.'}</p>
        )}
      </main>
      <output className="pip-toasts">
        {toasts.map((t) => (
          <div key={t.id}>{t.message}</div>
        ))}
      </output>
    </div>
  );
}

/** A view that throws shows its error and its source; the frame and the other views go on. */
class Boundary extends Component<{ from: string; children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <p role="alert">
        This page, from {this.props.from}, failed: {this.state.error.message}
      </p>
    );
  }
}

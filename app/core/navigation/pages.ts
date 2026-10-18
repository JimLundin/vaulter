import { createElement, type ComponentType, type ReactNode } from 'react';
import type { Navigation, Command } from './commands.ts';
import { go } from './routing.ts';

export interface MountedPage {
  matches: (path: string) => boolean;
  render: () => ReactNode;
}
export function definePage<Props extends object>(options: {
  patterns: readonly { match: (path: string) => object | null }[];
  component: ComponentType<Props>;
  destination: Pick<Navigation, 'label' | 'href' | 'icon'>;
  command: { id: string; keys: string };
}) {
  const matches = (path: string) => options.patterns.some((route) => route.match(path) !== null);
  return {
    matches,
    navigation: (path: string): Navigation => ({ ...options.destination, current: matches(path) }),
    command: (): Command => ({
      ...options.command,
      label: options.destination.label,
      icon: options.destination.icon,
      group: 'Go to',
      run: () => go(options.destination.href),
    }),
    mount: (props: Props, key?: string): MountedPage => ({
      matches,
      render: () => createElement(options.component, { ...props, key }),
    }),
  };
}
export function renderPage(path: string, pages: readonly MountedPage[], fallback: ReactNode) {
  return pages.find((page) => page.matches(path))?.render() ?? fallback;
}
export function pageNavigation(
  path: string,
  pages: readonly { navigation: (path: string) => Navigation }[],
) {
  return pages.map((page) => page.navigation(path));
}
export function pageCommands(pages: readonly { command: () => Command }[]) {
  return pages.map((page) => page.command());
}

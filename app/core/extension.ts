// What a feature adds to the app. Every feature, from the note page to the agent, is an Extension listed in
// extensions/index.ts; the shell only renders what they contribute. A new feature is a folder there and a
// line in that list; nothing else changes. Contribution points exist because a feature uses each one.
import type { ComponentType, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { ToolSet } from 'ai';
import type { Vault } from '../../core/derive.ts';
import type { Note } from '../../core/note-fields.ts';
import type { Entry, Hit } from '../../core/search.ts';
import type { Host } from './host.tsx';
import type { AgentWriter } from './writer.ts';
import type { VaultBackend } from './backend.ts';
import type { Secrets } from '../../core/sealed.ts';
import type { Route } from './route.ts';

export interface Page {
  title: string;
  body: ReactNode;
  /** How wide the page may be: a reading column (the default), or wide for dashboards and rails. */
  width?: 'reading' | 'wide';
}

/** Something Jim can do: in ⌘K, on its keys, and in the shortcuts list (?). */
export interface Command {
  id: string;
  label: string;
  /** Where ⌘K and the shortcuts list put it ("Go to", "Actions", "Note"). */
  group: string;
  icon?: LucideIcon;
  /** Its keys, as keys.ts reads them: "mod+j", "g c", "e", "?". */
  keys?: string;
  /** Not in ⌘K: keys only (list movement). */
  hidden?: boolean;
  /** Whether it applies here (a writer, a note on screen). */
  when?: (host: Host, route: Route) => boolean;
  run: (host: Host, route: Route) => void;
}

/** What a panel is opened with: a prompt to put in (and maybe send). `n` tells one opening from the next. */
export interface PanelArg {
  text: string;
  send: boolean;
  n: number;
}

export interface Extension {
  id: string;
  /** The page for a route path ("/calendar/", "/janne/"), or null if the path isn't this feature's.
   * Asked in list order; the first page wins. */
  page?: (path: string, host: Host) => Page | null;
  /** Pages in the sidebar; `when` hides one that doesn't apply (no writer, no key). Searchable as pages.
   * `keys` is its go-to ("g c"); `tab` puts it in the phone's bottom bar. */
  nav?: {
    label: string;
    href: string;
    order: number;
    summary?: string;
    icon?: LucideIcon;
    keys?: string;
    tab?: boolean;
    when?: (host: Host) => boolean;
    badge?: (host: Host) => number;
  }[];
  /** Commands: ⌘K, keys and the shortcuts list. */
  commands?: (host: Host) => Command[];
  /** A panel beside every page (the agent): docked on wide screens, a sheet or a drawer otherwise.
   * `indicator` renders on its button (busy, unread); `ask` offers "Ask …" in ⌘K. */
  panel?: {
    id: string;
    label: string;
    icon: LucideIcon;
    keys?: string;
    ask?: boolean;
    when?: (host: Host) => boolean;
    view: ComponentType<{ arg: PanelArg | null; close: () => void }>;
    indicator?: ComponentType;
  };
  /** Groups in the sidebar under the pages (areas, recent notes), by `order`. */
  sidebar?: { order: number; view: ComponentType }[];
  /** Sections under a note's body, by `order`; a section renders null when it has nothing to show. */
  noteSections?: { order: number; view: ComponentType<{ note: Note }> }[];
  /** Links in a note's footer ("edit"). */
  noteActions?: { label: string; href: (note: Note) => string; when?: (host: Host) => boolean }[];
  /** Entries for search and link previews (notes, topics, …). */
  search?: (v: Vault) => Entry[];
  /** Components notes can use in MDX (which ones notes may use is the vault's call: components in meta/schema.yaml). */
  mdx?: Record<string, ComponentType<any>>;
  /** Tools for the agent; async so they can load with it (the AI SDK stays out of the main bundle). */
  tools?: (ctx: AgentContext) => ToolSet | Promise<ToolSet>;
}

/** What agent tools work with: the writer (always current), the app's search, the backend's history
 * (Host.since) and the sealed secrets, for tools that reach beyond the vault (the app's source, the web). */
export interface AgentContext {
  w: AgentWriter;
  search: (query: string) => Hit[];
  since?: VaultBackend['since'];
  secrets?: Secrets;
  /** Stage the raw record of the chat since the last capture (the agent's record.ts), where the chat
   * keeps one: what needs judgement in, the day's log path and the exchange's time out. */
  capture?: (judged: {
    procedure: string;
    summary: string;
    topics: string[];
    where?: string[];
  }) => Promise<{ path: string; at: string; raw: string }>;
}

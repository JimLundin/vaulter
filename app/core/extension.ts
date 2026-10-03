// What a feature adds to the app. Every feature, from the note page to the agent, is an Extension listed in
// extensions/index.ts; the shell only renders what they contribute. A new feature is a folder there and a
// line in that list; nothing else changes. Contribution points exist because a feature uses each one.
import type { ComponentChild, ComponentType } from 'preact';
import type { ToolSet } from 'ai';
import type { Vault } from '../../core/derive.ts';
import type { Note } from '../../core/note-fields.ts';
import type { Entry, Hit } from '../../core/search.ts';
import type { Host } from './host.tsx';
import type { AgentWriter } from './writer.ts';
import type { VaultBackend } from './backend.ts';
import type { Secrets } from '../../core/sealed.ts';

export interface Page {
  title: string;
  body: ComponentChild;
}

export interface Extension {
  id: string;
  /** The page for a route path ("/calendar/", "/janne/"), or null if the path isn't this feature's.
   * Asked in list order; the first page wins. */
  page?: (path: string, host: Host) => Page | null;
  /** Links in the top bar; `when` hides one that doesn't apply (no writer, no key). Searchable as pages. */
  nav?: {
    label: string;
    href: string;
    order: number;
    summary?: string;
    when?: (host: Host) => boolean;
    badge?: (host: Host) => number;
  }[];
  /** Sections under a note's body, by `order`; a section renders null when it has nothing to show. */
  noteSections?: { order: number; view: ComponentType<{ note: Note }> }[];
  /** Links in a note's footer ("edit"). */
  noteActions?: { label: string; href: (note: Note) => string; when?: (host: Host) => boolean }[];
  /** Sections of Home, under the Home note, by `order`. */
  homeSections?: { order: number; view: ComponentType }[];
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

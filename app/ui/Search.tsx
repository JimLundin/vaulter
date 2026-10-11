// ⌘K: find and do. Empty, it offers the notes opened lately, the pages and the commands; typed, the
// notes ranked by the vault's search and already bound commands.
import { useMemo, useState } from 'react';
import { search } from '../vault/documents/search.ts';
import type { Command } from './command.ts';
import type { Entry, Hit } from '../vault/documents/search.ts';
import { showKeys } from './keys.ts';
import { useRecent } from './recent.ts';
import { go, useRoute } from './routing.ts';
import {
  Command as Palette,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  Icon,
  Kbd,
  CommandOverlay,
  Row,
  Text,
} from './kit/index.ts';

export function Keys({ keys }: { keys: string }) {
  return (
    <Row gap="xs">
      {showKeys(keys).map((key, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a sequence's steps
        <Kbd key={i}>{key}</Kbd>
      ))}
    </Row>
  );
}

const matching = (q: string, label: string) => label.toLowerCase().includes(q.toLowerCase());

export function Search({
  commands,
  index,
  open,
  setSearch,
  onAsk,
}: {
  commands: Command[];
  index: Map<string, Entry>;
  open: boolean;
  setSearch: (open: boolean) => void;
  onAsk?: (text: string) => void;
}) {
  const route = useRoute();

  const [q, setQ] = useState('');
  const query = q.trim();
  const hits = useMemo(() => (query ? search(index, query) : []), [index, query]);
  const recent = useRecent()
    .flatMap((h) => {
      const e = index.get(h);
      return e && h !== route.path ? [{ href: h, t: e.t }] : [];
    })
    .slice(0, 6);
  const shown = commands.filter((c) => !c.hidden && (!query || matching(query, c.label)));
  const close = () => {
    setSearch(false);
    setQ('');
  };
  const open_ = (href: string) => {
    close();
    go(href);
  };
  const run = (c: Command) => {
    close();
    c.run();
  };

  return (
    <SearchView
      open={open}
      query={q}
      onQueryChange={setQ}
      hits={hits}
      recent={recent}
      commands={shown}
      onClose={close}
      onOpen={open_}
      onRun={run}
      onAsk={
        onAsk
          ? (text) => {
              close();
              onAsk(text);
            }
          : undefined
      }
    />
  );
}

// The Search record view renders resolved results and explicit task actions without a vault,
// router, recent-entry subscription or Agent controller.
export function SearchView({
  open,
  query: q,
  onQueryChange,
  hits,
  recent,
  commands: shown,
  onClose,
  onOpen,
  onRun,
  onAsk,
}: {
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  hits: readonly Hit[];
  recent: readonly Pick<Entry, 'href' | 't'>[];
  commands: readonly Command[];
  onClose: () => void;
  onOpen: (href: string) => void;
  onRun: (command: Command) => void;
  onAsk?: (text: string) => void;
}) {
  const query = q.trim();
  const groups = [...new Set(shown.map((c) => c.group))];
  return (
    <CommandOverlay open={open} onClose={onClose} title="Search or ask" closeLabel="Close search">
      <Palette shouldFilter={false} loop={true}>
        <CommandInput
          value={q}
          onValueChange={onQueryChange}
          placeholder="Find a note, or type a command…"
        />
        <CommandList>
          <CommandEmpty>No match</CommandEmpty>
          {!query && recent.length > 0 && (
            <CommandGroup heading="Recent">
              {recent.map((r) => (
                <CommandItem
                  key={r.href}
                  value={`recent ${r.href}`}
                  onSelect={() => onOpen(r.href)}
                >
                  <Icon name="file" />
                  {r.t}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {hits.length > 0 && (
            <CommandGroup heading="Notes">
              {hits.map((h) => (
                <CommandItem
                  key={h.entry.href}
                  value={`hit ${h.entry.href}`}
                  onSelect={() => onOpen(h.entry.href)}
                >
                  {h.entry.k === 'topic' ? <Icon name="book" /> : <Icon name="file" />}
                  <Text as="span" size="sm">
                    {h.entry.t}
                  </Text>
                  {!!h.why && (
                    <Text as="span" size="xs" tone="subtle" truncate={true}>
                      {h.why}
                    </Text>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {!!query && onAsk && (
            <CommandGroup heading="Agent">
              <CommandItem value="ask" onSelect={() => onAsk(query)}>
                <Icon name="sparkles" />
                Ask the agent: {query}
              </CommandItem>
            </CommandGroup>
          )}
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {shown
                .filter((c) => c.group === g)
                .map((c) => (
                  <CommandItem key={c.id} value={`cmd ${c.id}`} onSelect={() => onRun(c)}>
                    {!!c.icon && <Icon name={c.icon} />}
                    {c.label}
                    {!!c.keys && (
                      <CommandShortcut>
                        <Keys keys={c.keys} />
                      </CommandShortcut>
                    )}
                  </CommandItem>
                ))}
            </CommandGroup>
          ))}
        </CommandList>
      </Palette>
    </CommandOverlay>
  );
}

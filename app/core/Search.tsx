// ⌘K: find and do. Empty, it offers the notes opened lately, the pages and the commands; typed, the
// notes and topics ranked by core/search.ts (the palette doesn't filter or sort them), the pages and
// commands that match, and asking a panel (the agent) the text itself.
import { useMemo, useState } from 'react';
import { FileTextIcon, HashIcon, SparklesIcon } from 'lucide-react';
import { search } from '../../core/search.ts';
import { titleOf } from '../../core/note-fields.ts';
import type { Command } from './extension.ts';
import { useHost } from './host.tsx';
import { showKeys } from './keys.ts';
import { useRecent } from './recent.ts';
import { go, useRoute } from './route.ts';
import {
  Command as Palette,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx';
import { Kbd, KbdGroup } from '@/components/ui/kbd.tsx';

export function Keys({ keys }: { keys: string }) {
  return (
    <KbdGroup>
      {showKeys(keys).map((k, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a sequence's steps, in order
        <Kbd key={i}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

const matching = (q: string, label: string) => label.toLowerCase().includes(q.toLowerCase());

export function Search({ commands }: { commands: Command[] }) {
  const host = useHost();
  const route = useRoute();
  const { search: open, setSearch } = host.ui;
  const [q, setQ] = useState('');
  const query = q.trim();
  const hits = useMemo(() => (query ? search(host.index, query) : []), [host.index, query]);
  const recent = useRecent()
    .flatMap((h) => {
      const n = host.vault.byHref.get(h);
      return n && h !== route.path ? [{ href: h, title: titleOf(n) }] : [];
    })
    .slice(0, 6);
  const shown = commands.filter(
    (c) => !c.hidden && (!c.when || c.when(host, route)) && (!query || matching(query, c.label)),
  );
  const groups = [...new Set(shown.map((c) => c.group))];
  const askers = host.extensions.flatMap((e) =>
    e.panel?.ask && (!e.panel.when || e.panel.when(host)) ? [e.panel] : [],
  );
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
    c.run(host, route);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? setSearch(true) : close())}>
      <DialogContent
        className="top-[12vh] translate-y-0 overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Find or do</DialogTitle>
        <DialogDescription className="sr-only">
          Notes, topics, pages and commands; or ask the agent.
        </DialogDescription>
        <Palette shouldFilter={false} loop={true}>
          <CommandInput
            value={q}
            onValueChange={setQ}
            placeholder="Find a note, or type a command…"
          />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No match</CommandEmpty>
            {!query && recent.length > 0 && (
              <CommandGroup heading="Recent">
                {recent.map((r) => (
                  <CommandItem
                    key={r.href}
                    value={`recent ${r.href}`}
                    onSelect={() => open_(r.href)}
                  >
                    <FileTextIcon />
                    {r.title}
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
                    onSelect={() => open_(h.entry.href)}
                    className="items-baseline"
                  >
                    {h.entry.k === 'topic' ? <HashIcon /> : <FileTextIcon />}
                    <span className={h.entry.k === 'topic' ? 'font-medium capitalize' : ''}>
                      {h.entry.k === 'topic' ? h.entry.t.replace(/-/g, ' ') : h.entry.t}
                    </span>
                    {!!h.why && <span className="truncate text-faint text-xs">{h.why}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!query &&
              askers.map((p) => (
                <CommandGroup key={p.id} heading={p.label}>
                  <CommandItem
                    value={`ask ${p.id}`}
                    onSelect={() => {
                      close();
                      host.ui.openPanel(p.id, { text: query, send: true });
                    }}
                  >
                    <SparklesIcon />
                    <span className="truncate">
                      Ask {p.label.toLowerCase()}: “{query}”
                    </span>
                  </CommandItem>
                </CommandGroup>
              ))}
            {groups.map((g) => (
              <CommandGroup key={g} heading={g}>
                {shown
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <CommandItem key={c.id} value={`cmd ${c.id}`} onSelect={() => run(c)}>
                      {!!c.icon && <c.icon />}
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
      </DialogContent>
    </Dialog>
  );
}

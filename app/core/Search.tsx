// Search: notes, topics and pages from the index, ranked by core/search.ts (the palette doesn't filter
// or sort). "/" or ⌘/Ctrl+K opens it; arrows, Enter and Escape work in it.
import { useEffect, useMemo, useState } from 'react';
import { SearchIcon } from 'lucide-react';
import { search, type Entry } from '../../core/search.ts';
import { link } from './route.ts';
import { Button } from '@/components/ui/button.tsx';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command.tsx';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog.tsx';

export function Search({ index }: { index: Map<string, Entry> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = useMemo(() => search(index, q), [index, q]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as Element).closest('input, textarea, [contenteditable]');
      if ((e.key === '/' && !typing) || (e.key === 'k' && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, []);
  const go = (href: string) => {
    location.hash = link(href);
    setOpen(false);
    setQ('');
  };

  return (
    <>
      <Button
        variant="outline"
        className="h-9 w-full justify-start gap-2 bg-surface px-3 font-normal text-faint shadow-none md:w-64"
        onClick={() => setOpen(true)}
      >
        <SearchIcon />
        <span className="flex-1 text-left">Find a note or topic…</span>
        <kbd className="rounded border bg-background px-1.5 font-mono text-xs">/</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="top-[12vh] translate-y-0 overflow-hidden p-0"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Find a note or topic</DialogTitle>
          <DialogDescription className="sr-only">
            Notes, topics and pages, best match first.
          </DialogDescription>
          <Command shouldFilter={false} loop={true}>
            <CommandInput value={q} onValueChange={setQ} placeholder="Find a note or topic…" />
            <CommandList className="max-h-[60vh]">
              {!!q && <CommandEmpty>No match</CommandEmpty>}
              {hits.map((h) => (
                <CommandItem
                  key={h.entry.href}
                  value={h.entry.href}
                  onSelect={go}
                  className="items-baseline gap-2"
                >
                  {h.entry.k === 'topic' ? (
                    <span className="font-semibold capitalize">
                      <span className="mr-0.5 text-primary">#</span>
                      {h.entry.t.replace(/-/g, ' ')}
                    </span>
                  ) : (
                    <span>{h.entry.t}</span>
                  )}
                  {!!h.why && <span className="truncate text-xs text-faint">{h.why}</span>}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

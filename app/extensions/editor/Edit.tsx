// Edit a file as text, frontmatter and all, with a preview beside it (or a tab away on a narrow page),
// and stage it (⌘S); or start a new note at a path. Every change is kept as a draft until it's staged.
import { useDeferredValue, useEffect, useId, useRef, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import { hrefForId } from '../notes/model/paths.ts';
import { isVaultPath, parseNote } from '../notes/model/note.ts';
import { today } from '../../core/format.ts';
import { useWriter } from '../../core/host.tsx';
import { showKeys } from '../../core/keys.ts';
import { go, link } from '../../core/route.ts';
import { later } from '../../core/later.ts';
import { NoteBody } from '../reader/NotePage.tsx';
import { Confirm } from './parts.tsx';
import { Empty, ErrorState, PageHeader } from '@/components/layout.tsx';
import { Alert, AlertDescription } from '@/components/ui/alert.tsx';
import { Badge } from '@/components/ui/badge.tsx';
import { Button } from '@/components/ui/button.tsx';
import { Kbd } from '@/components/ui/kbd.tsx';
import { Label } from '@/components/ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.tsx';
import { Textarea } from '@/components/ui/textarea.tsx';
import { changesPage } from './routes.ts';

/** A new note's starting point (meta/conventions.md): the frontmatter fields, the title, See also. */
const template = (path: string) => {
  const title = path
    .replace(/\.mdx?$/, '')
    .split('/')
    .pop()!;
  return path.startsWith('daily/')
    ? `---\nwhere: []\n---\n# ${title}\n\n- \n`
    : `---\ntype: topic\naliases: []\ntags: []\ncreated: ${today()}\nsummary: ""\n---\n# ${title}\n\n\n\n## See also\n`;
};

/** Drafts: the unstaged text of a file, in localStorage, by path. */
const draftKey = (path: string) => `vaulter.draft:${path}`;
const keepDraft = (path: string, text: string, clean: string) =>
  text === clean
    ? localStorage.removeItem(draftKey(path))
    : localStorage.setItem(draftKey(path), text);
const dropDraft = (path: string) => localStorage.removeItem(draftKey(path));

/** The text as the note page would show it. */
function Preview({ path, text }: { path: string; text: string }) {
  const shown = useDeferredValue(text);
  if (path.endsWith('.yaml')) return <Empty>No preview for YAML.</Empty>;
  return <NoteBody note={parseNote({ path, text: shown })} />;
}

export function Edit({ path }: { path: string }) {
  const w = useWriter();
  const original = w.base.find((f) => f.path === path)?.text;
  const staged = w.overlay?.files[path];
  /** The text with nothing to lose: what's staged, else the file, else the template. */
  const clean = staged ?? original ?? template(path);
  const [start] = useState(() => {
    const draft = localStorage.getItem(draftKey(path));
    return draft !== null && draft !== clean
      ? { text: draft, restored: true }
      : { text: clean, restored: false };
  });
  const [text, setText] = useState(start.text);
  const [restored, setRestored] = useState(start.restored);
  const id = useId();
  const href = hrefForId(path.replace(/\.mdx?$/, ''));
  const dirty = text !== clean;
  const latest = useRef<{ text: string; clean: string; done: boolean }>({
    text,
    clean,
    done: false,
  });
  latest.current = { ...latest.current, text, clean };

  // The draft: kept a moment after typing stops, and on leaving the page unless it was staged.
  useEffect(() => {
    const t = setTimeout(() => latest.current.done || keepDraft(path, text, clean), 400);
    return () => clearTimeout(t);
  }, [path, text, clean]);
  useEffect(
    () => () => {
      const l = latest.current;
      if (!l.done) keepDraft(path, l.text, l.clean);
    },
    [path],
  );
  // Leaving the app with unstaged text asks first.
  useEffect(() => {
    if (!dirty) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', ask);
    return () => removeEventListener('beforeunload', ask);
  }, [dirty]);

  const save = async () => {
    const t = latest.current.text;
    if (t === latest.current.clean) return;
    latest.current.done = true;
    dropDraft(path);
    await w.stage(path, t);
    toast.success(`Staged ${path}`, {
      action: { label: 'Review', onClick: () => go(changesPage.href()) },
    });
    go(href);
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  // ⌘S stages, from anywhere on the page (the textarea too).
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        later(saveRef.current());
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  if (!isVaultPath(path))
    return (
      <ErrorState>
        {path} isn't a vault file: notes are at the root (.md or .mdx), or daily/, captures/, meta/
        (.md), and meta/schema.yaml.
      </ErrorState>
    );

  const discardDraft = () => {
    dropDraft(path);
    setText(clean);
    setRestored(false);
  };
  const cancel = () => {
    latest.current.done = true;
    dropDraft(path);
  };
  const remove = async () => {
    latest.current.done = true;
    dropDraft(path);
    await w.stage(path, null);
    toast(`Deletion of ${path} staged`, {
      action: { label: 'Review', onClick: () => go(changesPage.href()) },
    });
    go(changesPage.href());
  };
  const pane = 'data-[state=inactive]:hidden @4xl:data-[state=inactive]:block';
  const heading = 'mb-2 hidden text-sm font-medium @4xl:block';
  return (
    <div className="v-edit">
      <PageHeader
        kind={original === undefined ? 'new' : 'edit'}
        meta={staged !== undefined && <Badge variant="outline">staged</Badge>}
        title={<span className="break-all font-mono text-2xl font-semibold">{path}</span>}
      />
      {!!(restored && dirty) && (
        <Alert className="mb-4">
          <RotateCcwIcon />
          <AlertDescription className="flex flex-wrap items-center gap-x-2">
            Draft restored ·
            <button
              type="button"
              className="cursor-pointer font-medium text-primary hover:underline"
              onClick={discardDraft}
            >
              Discard draft
            </button>
          </AlertDescription>
        </Alert>
      )}
      <Tabs defaultValue="write" className="gap-3">
        <TabsList className="@4xl:hidden">
          <TabsTrigger value="write" className="px-4">
            Write
          </TabsTrigger>
          <TabsTrigger value="preview" className="px-4">
            Preview
          </TabsTrigger>
        </TabsList>
        <div className="@4xl:grid @4xl:grid-cols-2 @4xl:gap-6">
          <TabsContent value="write" forceMount={true} className={pane}>
            <Label htmlFor={id} className={heading}>
              Text, frontmatter and all
            </Label>
            <Textarea
              id={id}
              aria-label="Text, frontmatter and all"
              className="min-h-[60vh] resize-y field-sizing-fixed font-mono text-sm leading-relaxed @4xl:h-[70vh]"
              value={text}
              spellCheck={true}
              onChange={(e) => setText(e.currentTarget.value)}
            />
          </TabsContent>
          <TabsContent value="preview" forceMount={true} className={pane}>
            <div className={heading}>Preview</div>
            <div className="min-h-[60vh] overflow-y-auto rounded-md border px-5 py-4 @4xl:h-[70vh] @4xl:min-h-0">
              <Preview path={path} text={text} />
            </div>
          </TabsContent>
        </div>
      </Tabs>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={!dirty}>
          Stage
          <Kbd className="max-sm:hidden bg-primary-foreground/15 text-primary-foreground">
            {showKeys('mod+s').join(' ')}
          </Kbd>
        </Button>
        <Button asChild={true} variant="ghost">
          <a
            className="text-foreground no-underline"
            href={link(original === undefined && staged === undefined ? '/' : href)}
            onClick={cancel}
          >
            Cancel
          </a>
        </Button>
        {original !== undefined && (
          <Confirm
            trigger={
              <Button variant="ghost" className="ml-auto text-destructive">
                Delete file
              </Button>
            }
            title={`Delete ${path}?`}
            description="The deletion is staged; commit it in Changes."
            action="Delete"
            destructive={true}
            onConfirm={remove}
          />
        )}
      </div>
      <p className="mt-3 text-sm text-faint">
        Staged edits show at once; commit them in{' '}
        <a className="text-primary no-underline hover:underline" href={link(changesPage.href())}>
          Changes
        </a>
        . Unstaged text is kept as a draft.
      </p>
    </div>
  );
}

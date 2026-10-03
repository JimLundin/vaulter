// Code blocks, highlighted once Shiki has loaded (the first page with a fenced block loads it, with
// only that block's language). Plain text until then, or for a language it doesn't know.
import { useEffect, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
// biome-ignore lint/correctness/noUnresolvedImports: Fragment is in @types/react's namespace, which Biome doesn't follow
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import type { HighlighterCore } from 'shiki/core';

const LANGS: Record<string, () => Promise<any>> = {
  markdown: () => import('shiki/langs/markdown.mjs'),
  ocaml: () => import('shiki/langs/ocaml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  shape: () => import('../../core/shape.tmLanguage.json'),
};

let shiki: Promise<HighlighterCore> | undefined;
const highlighter = () => {
  shiki ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      }),
  );
  return shiki;
};

async function highlight(code: string, lang: string) {
  const h = await highlighter();
  if (!h.getLoadedLanguages().includes(lang)) await h.loadLanguage(await LANGS[lang]());
  const hast = h.codeToHast(code, { lang, themes: { light: 'github-light', dark: 'github-dark' } });
  return toJsxRuntime(hast as any, {
    Fragment,
    jsx: jsx as any,
    jsxs: jsxs as any,
    elementAttributeNameCase: 'react',
    stylePropertyNameCase: 'dom',
  });
}

/** Replaces <pre> in rendered notes. */
export function Pre({ children, ...props }: { children?: ReactNode }) {
  const code = children as ReactElement<{ className?: string; children?: unknown }> | undefined;
  const lang = /language-(\S+)/.exec(String(code?.props?.className ?? ''))?.[1] ?? '';
  const text = typeof code?.props?.children === 'string' ? code.props.children : '';
  const [out, setOut] = useState<ReactNode>(null);
  useEffect(() => {
    setOut(null);
    if (!(text && LANGS[lang])) return;
    let live = true;
    highlight(text.replace(/\n$/, ''), lang).then(
      (v) => {
        if (live) setOut(v);
      },
      () => {
        // Stays plain text.
      },
    );
    return () => {
      live = false;
    };
  }, [text, lang]);
  return out ?? <pre {...props}>{children}</pre>;
}

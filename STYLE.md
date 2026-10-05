# Style

Biome formats and lints (`npm run format`, `npm run lint`): 80 columns, 2 spaces, single quotes,
semicolons, trailing commas, braces on every body. This page is what it can't check. More lines are
fine when they make the code easier to read.

## A file, top to bottom

1. A header comment: at most two lines, saying what the file is.
2. Imports (Biome orders them).
3. Types.
4. Constants.
5. Private helpers.
6. Exports.

## Names

Say what a thing is. One-letter names only for a loop index, or the parameter of a one-line
callback whose meaning is plain from the call (`items.map((i) => i.id)`).

```ts
// no
const h = handlers.get(`${q.from}/${q.topic}`);

// yes
const handler = handlers.get(`${question.from}/${question.topic}`);
```

## Functions

A named function is a `function`. An arrow is for a callback, or a one-line value.

```ts
// no
const deliver = async (question: Kept) => { … };

// yes
async function deliver(question: Kept) { … }
```

## Leaving fields out

`omit` from `#kernel`, not throwaway names.

```ts
// no
const { id: _, meta: _m, ...fields } = record;

// yes
const fields = omit(record, 'id', 'meta');
```

## Comments

- A doc comment (`/** … */`) on what a file exports: what it is for, in one or two sentences.
- An inline comment says why, never what the next line does.
- Plain sentences. No chains of colons and semicolons.

## Prompts

What a model is told lives in a Markdown file beside the code that sends it (`wiki/revise.md`,
`agent/instructions.md`), imported as text (`import instructions from './revise.md?raw'`), so it
reads as prose and keeps its own line breaks.

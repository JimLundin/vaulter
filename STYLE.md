# Style

Biome formats and lints (`npm run format`, `npm run lint`): 80 columns, 4 spaces, single quotes,
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
const c = q.choices.find((x) => x.id === a);

// yes
const chosen = question.choices.find((choice) => choice.id === answer);
```

## Functions

A named function is a `function`. An arrow is for a callback, or a one-line value.

```ts
// no
const deliver = async (question: Kept) => { … };

// yes
async function deliver(question: Kept) { … }
```

## Types

- An extension's interface is what it exports. Its types come from the exported objects
  (`typeof notes`), not from an interface that restates them.
- No casts. Data that comes in untyped (from a model, a fetch, or a call a question kept) is parsed
  with Zod, and its type is the schema's. An operation parses its own input.
- A record is its domain type: `type Note = Rec<…>`, with no function that copies it into another
  shape. Storage sets `id` itself, so a change returns the record spread with what changed, and
  checks it against the collection's schema.

```ts
// no
const call = question.data as unknown as Asked;

// yes
const call = Asked.parse(question.data);
```

## Exports

Everything an extension exports that does something is an operation (`operation()` from `#core`):
one input, checked by its schema, and a promise back. Every extension exports `extension`, the
operations it offers people and Vaulter, if only `{}`. Only what builds a value is a plain function
(`collection()`, `yesNo()`).

```ts
// no
export function get(id: string) { … }

// yes
get: operation({ description: 'A note, as it was said.', input: z.object({ id: z.string() }), run }),
```

## Comments

- A doc comment (`/** … */`) on what a file exports: what it is for, in one or two sentences.
- An inline comment says why, never what the next line does.
- Plain sentences. No chains of colons and semicolons.

## Prompts

What a model is told lives in a Markdown file beside the code that sends it
(`agent/instructions.md`), imported as text (`import instructions from './instructions.md?raw'`), so it
reads as prose and keeps its own line breaks.

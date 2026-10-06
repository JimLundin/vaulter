// The core: what every extension offers, and the collecting of it. An
// extension describes what it offers in the core's terms, and whatever reads
// those (the agent, the shell, a question's choice) reads them here, so no
// extension knows its readers.

import { z } from 'zod';

/** How an operation is called. Taken from a method, whose input is checked
 * both ways, so that operations of any input fit one record. */
type Signature<Input extends z.ZodType, Output> = {
    call(input: z.input<Input>): Promise<Output>;
}['call'];

/** What an operation is, besides what it does. */
interface Described<Input extends z.ZodType> {
    /** What it does, and when to use it, for whoever offers it to a person
     * or a model. */
    description: string;
    /** Whether it rewrites what is known, such as merging pages or
     * retracting a fact: whoever runs it for a person asks them first. */
    rewrites?: boolean;
    /** What it takes. Every call is checked against it, wherever it comes
     * from: code, the model, or a call kept in storage. */
    input: Input;
}

/** Something a person or Vaulter can do through an extension, and other
 * code calls the same way: a function of one input, described. */
export type Operation<
    Input extends z.ZodType = z.ZodType,
    Output = unknown,
> = Signature<Input, Output> & Described<Input>;

/** A call of an operation, kept as data: a question's choice holds the call
 * that choosing it makes. */
export const Call = z.object({
    extension: z.string(),
    operation: z.string(),
    input: z.unknown(),
});
export type Call = z.infer<typeof Call>;

/** What an extension offers people and Vaulter, exported from its index.ts
 * as `export const extension = { … } satisfies Extension` by every
 * extension, if only as `{}`. Everything it exports for other code is an
 * operation too: these are the ones it offers. */
export interface Extension {
    /** By name: letters and digits, with single underscores. */
    operations?: Record<string, Operation>;
}

/** An extension as the core has loaded it: its folder's name, and what it
 * offers. */
export interface Loaded {
    id: string;
    operations: Record<string, Operation>;
}

const modules = import.meta.glob<{ extension?: Extension }>(
    '../../extensions/*/index.ts',
);
let loading: Promise<Loaded[]> | undefined;

async function load() {
    return await Promise.all(
        Object.entries(modules).map(async ([path, importModule]) => {
            const { extension } = await importModule();
            const id = path.split('/').at(-2) ?? path;
            if (!extension) {
                throw new Error(`${id} exports no extension`);
            }
            return { id, operations: extension.operations ?? {} };
        }),
    );
}

/** An operation that checks its input and runs `run` with it, its input's
 * type taken from its schema. It answers with a promise, so that an input it
 * refuses is a rejection, like any other failure. */
export function operation<Input extends z.ZodType, Output>({
    run,
    ...described
}: Described<Input> & {
    run: (input: z.output<Input>) => Output | Promise<Output>;
}): Operation<Input, Output> {
    return Object.assign(
        async (input: z.input<Input>) =>
            await run(described.input.parse(input)),
        described,
    );
}

/** Every extension, each started as it is imported, and what it offers.
 * The first call starts them all. It settles once every extension has
 * started, so an extension that reads it doesn't await it while it starts
 * itself. */
export function extensions() {
    loading ??= load();
    return loading;
}

/** Makes `made`, a call kept as data, once every extension has started. */
export async function call(made: Call) {
    const loaded = await extensions();
    const from = loaded.find((entry) => entry.id === made.extension);
    const own = from?.operations[made.operation];
    if (!own) {
        throw new Error(`${made.extension} has no operation ${made.operation}`);
    }
    return await own(made.input);
}

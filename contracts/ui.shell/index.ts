// The shell: the frame every screen sits in. Extensions add views (pages at a route, optionally in the
// navigation) and actions (buttons in a slot, on keys); the shell labels each with the extension that
// added it, so it is always clear what turning one off would remove.
import { defineContract } from '@pip/kernel';
import { z } from 'zod';
import type { ComponentType } from 'react';
import type { Unsubscribe } from '@contracts/records';

/** Where an action goes. Typed constants: a misspelled slot doesn't compile. */
export const slots = {
  /** The main button: the bottom bar on a phone, the header on a desktop. */
  primary: 'primary',
  /** Beside the page title. */
  toolbar: 'toolbar',
} as const;
export type Slot = (typeof slots)[keyof typeof slots];

export interface ViewProps {
  /** The route's parameters: `/wiki/:id` at `/wiki/abc` gives `{ id: 'abc' }`. */
  params: Record<string, string>;
}

export interface View {
  id: string;
  /** `/notes`, `/wiki/:id`. */
  route: string;
  title: string;
  component: ComponentType<ViewProps>;
  /** In the navigation, by `order`. */
  nav?: { label: string; order: number };
}

export interface Action {
  id: string;
  label: string;
  slot: Slot;
  /** "n", "mod+k": a press runs it. */
  keys?: string;
  run: () => void | Promise<void>;
}

export interface ShellV1 {
  readonly slots: typeof slots;
  addView: (view: View) => Unsubscribe;
  addAction: (action: Action) => Unsubscribe;
  /** Goes to a route: "/wiki/abc". */
  navigate: (path: string) => void;
  /** A short confirmation at the bottom of the screen. */
  toast: (message: string) => void;
}

const fn = z.custom<(...args: never[]) => unknown>((f) => typeof f === 'function', {
  message: 'not a function',
});
const Id = z.string().regex(/^[a-z][a-z0-9-]*$/);
const Route = z.string().regex(/^\/[\w\-/:]*$/, { message: 'a path such as /wiki/:id' });

export const shell = defineContract<ShellV1>({
  name: 'ui.shell',
  version: '1.0.0',
  inputs: {
    addView: z.tuple([
      z.object({
        id: Id,
        route: Route,
        title: z.string().min(1),
        component: z.custom<ComponentType<ViewProps>>((c) => typeof c === 'function'),
        nav: z.object({ label: z.string().min(1), order: z.number() }).optional(),
      }),
    ]),
    addAction: z.tuple([
      z.object({
        id: Id,
        label: z.string().min(1),
        slot: z.enum(['primary', 'toolbar']),
        keys: z.string().optional(),
        run: fn,
      }),
    ]),
    navigate: z.tuple([z.string().startsWith('/')]),
    toast: z.tuple([z.string()]),
  },
});

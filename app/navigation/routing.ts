// Hash routes: "#/janne/#heading". The path is a site href (paths.ts hrefForId: "/", "/janne/",
// "/daily/2026-06-06/", "/topic/work/", "/map/"); an optional second "#" names a heading on the page.
import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  anchor: string;
}

export const parseRoute = (hash: string): Route => {
  const h = hash.replace(/^#/, '');
  const i = h.indexOf('#');
  const path = (i < 0 ? h : h.slice(0, i)) || '/';
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    anchor: i < 0 ? '' : decodeURIComponent(h.slice(i + 1)),
  };
};

/** A site href ("/janne/#h") as a link in the app ("#/janne/#h"). */
export const link = (href: string) => `#${href}`;

/** Goes to a site href. */
export const go = (href: string) => {
  location.hash = link(href);
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

/** The params a route's pattern names: `{ file: string }` for "/edit/:file/". */
export type Params<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? { [K in Name]: string } & Params<`/${Rest}`>
  : Record<never, never>;

/** A feature's route, typed by the params its pattern names. The feature matches its pages with it, and
 * every link to them, its own or another feature's, is made by it, so a link can't go to a route that
 * isn't there. */
export interface Pattern<P extends string> {
  readonly pattern: P;
  /** The params of `path` if it is at this route, or null. */
  match: (path: string) => Params<P> | null;
  /** The site href at this route, with its params in it (encoded). */
  href: (...params: keyof Params<P> extends never ? [] : [Params<P>]) => string;
}

/** A route at `pattern`: "/calendar/", or "/edit/:file/" with a param. */
export function pattern<const P extends `/${string}/`>(at: P): Pattern<P> {
  const parts = at.split('/');
  return {
    pattern: at,
    match(path) {
      const given = path.split('/');
      if (given.length !== parts.length) return null;
      const params: Record<string, string> = {};
      for (const [i, part] of parts.entries()) {
        const value = given[i] ?? '';
        if (part.startsWith(':') && value) params[part.slice(1)] = decodeURIComponent(value);
        else if (part !== value) return null;
      }
      // The pattern's names are the params' keys: TypeScript can't follow a loop to see it
      return params as Params<P>;
    },
    href: (...[params]) =>
      parts
        .map((part) =>
          part.startsWith(':')
            ? encodeURIComponent(
                (params as Record<string, string> | undefined)?.[part.slice(1)] ?? '',
              )
            : part,
        )
        .join('/'),
  };
}

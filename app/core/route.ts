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

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

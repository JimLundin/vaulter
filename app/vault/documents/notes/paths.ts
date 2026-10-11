// Shared by the remark plugin (build config), pages and components.
// A note's id is its vault path without extension: "Örjan Ås", "daily/2026-06-06".

export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Site URL for a note id. */
export const hrefForId = (id: string) =>
  id === 'Home' ? '/' : `/${id.split('/').map(slugify).join('/')}/`;

const safeDecode = (s: string) => {
  try {
    return decodeURI(s);
  } catch {
    return s;
  }
};

/** Parse a vault link like "/Örjan Ås.md#x" -> { id, hash } or null if not internal. */
export const parseVaultLink = (url: string): { id: string; hash: string } | null => {
  if (!url.startsWith('/') || url.startsWith('//')) return null;
  const [path, hash] = safeDecode(url).split('#');
  const m = path.match(/^\/(.+)\.mdx?$/);
  return m ? { id: m[1], hash: hash || '' } : null;
};

/** Vault link -> site URL (unchanged if not a vault link). */
export const siteHref = (url: string) => {
  const p = parseVaultLink(url);
  return p ? hrefForId(p.id) + (p.hash ? `#${p.hash}` : '') : url;
};

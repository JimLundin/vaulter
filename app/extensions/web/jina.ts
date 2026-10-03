// The web through Jina (jina.ai): search (s.jina.ai, needs a key) and any page as Markdown (r.jina.ai,
// works without one, at a lower rate). Both allow the app's origin, so the browser calls them directly; the
// pages themselves are fetched by Jina, never by the browser. Results are text from strangers: the tools
// hand them to the model as information, never as instructions.

export const SEARCH = 'https://s.jina.ai';
export const READER = 'https://r.jina.ai';

const RESULT_CHARS = 1500;
export const PAGE_CHARS = 20_000;

export interface SearchResult {
  title: string;
  url: string;
  description: string;
  content: string;
}

export interface Page {
  title: string;
  url: string;
  content: string;
  /** Where this slice starts, and the page's whole length. */
  start: number;
  length: number;
}

const headers = (key?: string) => ({
  Accept: 'application/json',
  'X-Retain-Images': 'none',
  ...(key ? { Authorization: `Bearer ${key}` } : {}),
});

const call = async (url: string, key: string | undefined, fetchFn: typeof fetch) => {
  const res = await fetchFn(url, { headers: headers(key) });
  const body = await res.json().catch(() => null);
  if (!res.ok)
    throw new Error(
      body?.readableMessage ?? body?.message ?? `${new URL(url).host} answered ${res.status}`,
    );
  return body?.data;
};

/** The top results for a query, each with the start of its page; `site` keeps to one site. */
export async function search(
  query: string,
  key: string,
  site?: string,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<SearchResult[]> {
  const q = new URLSearchParams({ q: query, ...(site ? { site } : {}) });
  const data: Partial<SearchResult>[] = (await call(`${SEARCH}/?${q}`, key, fetchFn)) ?? [];
  return data.map((r) => ({
    title: r.title ?? '',
    url: r.url ?? '',
    description: r.description ?? '',
    content: (r.content ?? '').slice(0, RESULT_CHARS),
  }));
}

/** A page as Markdown, PAGE_CHARS at a time from `start`. Only http(s). */
export async function read(
  url: string,
  key?: string,
  start = 0,
  fetchFn: typeof fetch = (...a) => fetch(...a),
): Promise<Page> {
  let u: URL;
  try {
    u = new URL(url);
  } catch (e) {
    throw new Error(`not a URL: ${url}`, { cause: e });
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:')
    throw new Error(`only http and https pages: ${url}`);
  const data = (await call(`${READER}/${u.href}`, key, fetchFn)) ?? {};
  const all = String(data.content ?? '');
  return {
    title: String(data.title ?? ''),
    url: String(data.url ?? u.href),
    content: all.slice(start, start + PAGE_CHARS),
    start,
    length: all.length,
  };
}

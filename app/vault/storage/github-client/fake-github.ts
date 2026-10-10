// An in-memory GitHub for tests: blobs by real git sha, flat trees, commits with parents, and a main
// ref that only fast-forwards — the REST surface app/github.ts uses, behind a fake fetch.
import { github } from './api.ts';
import { blobSha } from '../blob-sha.ts';

const enc = new TextEncoder();
const b64 = (t: string) => btoa(String.fromCharCode(...enc.encode(t)));
const id = async (v: unknown) =>
  (await blobSha(enc.encode(JSON.stringify(v)) as Uint8Array<ArrayBuffer>)).slice(0, 40);

export async function fakeGitHub(files: Record<string, string>) {
  const blobs = new Map<string, string>();
  const trees = new Map<string, Record<string, string>>();
  const commits = new Map<
    string,
    { tree: string; parent: string; message: string; date: string }
  >();
  const putBlob = async (t: string) => {
    const s = await blobSha(enc.encode(t) as Uint8Array<ArrayBuffer>);
    blobs.set(s, t);
    return s;
  };
  const putTree = async (m: Record<string, string>) => {
    const s = `t${(await id(m)).slice(1)}`;
    trees.set(s, m);
    return s;
  };
  const putCommit = async (
    tree: string,
    parent: string,
    message: string,
    date = new Date(1_800_000_000_000 + commits.size * 1000).toISOString(),
  ) => {
    const s = `c${(await id([tree, parent, message, commits.size])).slice(1)}`;
    commits.set(s, { tree, parent, message, date });
    return s;
  };
  const first = Object.fromEntries(
    await Promise.all(Object.entries(files).map(async ([p, t]) => [p, await putBlob(t)])),
  );
  const state = {
    main: await putCommit(await putTree(first), '', 'initial'),
    calls: [] as string[],
    tamper: '' as string,
  };

  /** Simulate someone else pushing to main (at `date`, ISO, if given). */
  const push = async (
    change: Record<string, string | null>,
    message = 'elsewhere',
    date?: string,
  ) => {
    const m = { ...trees.get(commits.get(state.main)!.tree)! };
    await Promise.all(
      Object.entries(change).map(async ([p, t]) => {
        if (t === null) delete m[p];
        else m[p] = await putBlob(t);
      }),
    );
    state.main = await putCommit(await putTree(m), state.main, message, date);
  };
  const filesAt = (commit = state.main) =>
    Object.fromEntries(
      Object.entries(trees.get(commits.get(commit)!.tree)!).map(([p, s]) => [p, blobs.get(s)!]),
    );

  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^https:\/\/gh\.test\/repos\/[^/]+\/[^/]+/, '');
    const method = init.method ?? 'GET';
    const body = init.body ? JSON.parse(String(init.body)) : null;
    state.calls.push(`${method} ${path}`);
    const json = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
      new Response(JSON.stringify(v), { status, headers });
    if (path === '/git/ref/heads/main') {
      const etag = `"${state.main}"`;
      if ((init.headers as any)?.['If-None-Match'] === etag)
        return new Response(null, { status: 304 });
      return json({ object: { sha: state.main } }, 200, { ETag: etag });
    }
    if (method === 'GET' && path.startsWith('/git/trees/')) {
      const c = commits.get(path.slice(11).split('?')[0])!;
      return json({
        sha: c.tree,
        truncated: false,
        tree: Object.entries(trees.get(c.tree)!).map(([p, s]) => ({
          path: p,
          sha: s,
          type: 'blob',
        })),
      });
    }
    if (method === 'GET' && path.startsWith('/git/blobs/'))
      return json({ content: b64(state.tamper || blobs.get(path.slice(11))!), encoding: 'base64' });
    if (method === 'POST' && path === '/git/blobs')
      return json({ sha: await putBlob(body.content) }, 201);
    if (method === 'POST' && path === '/git/trees') {
      const m = { ...trees.get(body.base_tree)! };
      for (const e of body.tree) {
        if (e.sha === null) delete m[e.path];
        else {
          if (!blobs.has(e.sha)) return json({ message: 'no blob' }, 422);
          m[e.path] = e.sha;
        }
      }
      return json({ sha: await putTree(m) }, 201);
    }
    if (method === 'POST' && path === '/git/commits')
      return json({ sha: await putCommit(body.tree, body.parents[0], body.message) }, 201);
    if (method === 'PATCH' && path === '/git/refs/heads/main') {
      if (commits.get(body.sha)?.parent !== state.main && !body.force)
        return json({ message: 'Update is not a fast forward' }, 422);
      state.main = body.sha;
      return json({ object: { sha: body.sha } });
    }
    if (method === 'GET' && path.startsWith('/commits?')) {
      const q = new URLSearchParams(path.slice(9));
      const until = q.get('until') ?? '\uffff';
      const max = Number(q.get('per_page') ?? 30);
      const out: string[] = [];
      for (let c = state.main; c && out.length < max; c = commits.get(c)!.parent)
        if (commits.get(c)!.date <= until) out.push(c);
      return json(
        out.map((s) => ({
          sha: s,
          commit: { message: commits.get(s)!.message, committer: { date: commits.get(s)!.date } },
        })),
      );
    }
    if (method === 'GET' && path.startsWith('/commits/')) {
      const s = path.slice(9);
      const c = commits.get(s)!;
      const before = c.parent ? trees.get(commits.get(c.parent)!.tree)! : {};
      const after = trees.get(c.tree)!;
      const changed = [...new Set([...Object.keys(before), ...Object.keys(after)])]
        .filter((p) => before[p] !== after[p])
        .map((p) => ({
          filename: p,
          status: !before[p] ? 'added' : !after[p] ? 'removed' : 'modified',
          sha: after[p] ?? before[p],
          patch: `@@ ${p}`,
        }));
      return json({
        sha: s,
        commit: { message: c.message, committer: { date: c.date } },
        parents: c.parent ? [{ sha: c.parent }] : [],
        files: changed,
      });
    }
    if (method === 'GET' && path.startsWith('/compare/')) {
      const [a, b] = path
        .slice(9)
        .split('...')
        .map((c) => trees.get(commits.get(c)!.tree)!);
      return json({
        files: [...new Set([...Object.keys(a), ...Object.keys(b)])]
          .filter((p) => a[p] !== b[p])
          .map((p) => ({ filename: p })),
      });
    }
    return json({ message: 'Not Found' }, 404);
  }) as typeof fetch;

  return {
    state,
    push,
    filesAt,
    fetchFn,
    gh: github('tok', undefined, 'https://gh.test', fetchFn),
  };
}

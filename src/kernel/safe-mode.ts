// Safe mode: a bare screen, in plain DOM and part of the kernel, that works whatever an extension does.
// From here: choose the repo and branch, pin a commit (a rollback), turn extensions and drafts off, and
// set secrets.
import type { State } from './start.ts';

type Child = Node | string | null | undefined | false;

function h(tag: string, attrs: Record<string, string | boolean> = {}, ...children: Child[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs))
    if (v === true) el.setAttribute(k, '');
    else if (v !== false) el.setAttribute(k, v);
  el.append(...children.filter((c): c is Node | string => !!c));
  return el;
}

const css = `
body { margin: 0; font: 15px/1.5 system-ui, sans-serif; color-scheme: light dark; }
.safe { max-width: 40rem; margin: 2rem auto; padding: 0 1rem; display: grid; gap: 1rem; }
.safe fieldset { display: grid; gap: .5rem; border: 1px solid #8884; border-radius: .5rem; }
.safe label { display: grid; gap: .2rem; }
.safe label.row { display: flex; gap: .5rem; align-items: baseline; }
.safe input[type=text], .safe input[type=password] { font: inherit; padding: .35rem .5rem; }
.safe .problem { color: #c33; margin: 0; }
.safe small { opacity: .7; }
`;

export async function safeMode(s: State) {
  const config = s.config.get();
  const refs = s.src ? await s.src.refs(config.repo).catch(() => [] as string[]) : [];
  const problems = new Map(s.refused.map((r) => [r.id, r.problems]));
  for (const [id, p] of s.kernel.problems()) problems.set(id, p);
  const running = new Set(s.kernel.running().map((r) => r.id));
  const statics = [...s.kernel.seen.values()];

  const field = (label: string, name: string, value: string, extra: Record<string, string> = {}) =>
    h('label', {}, label, h('input', { type: 'text', name, value, ...extra }));
  const check = (name: string, label: string, on: boolean, note = '') =>
    h(
      'label',
      { class: 'row' },
      h('input', { type: 'checkbox', name, checked: on }),
      label,
      h('small', {}, note),
    );

  const secretRows = statics.flatMap((st) =>
    Object.entries(st.secrets).map(([name, spec]) =>
      h(
        'label',
        {},
        `${st.id}: ${spec.label}`,
        h('input', {
          type: 'password',
          name: `secret:${st.id}/${name}`,
          placeholder: 'unchanged; type to set, a single space to forget',
          autocomplete: 'off',
        }),
      ),
    ),
  );
  const drafts = refs.filter((r) => r.startsWith('draft/'));

  const form = h(
    'form',
    { class: 'safe' },
    h('h1', {}, 'Vaulter: safe mode'),
    s.error && h('p', { class: 'problem' }, s.error),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Source'),
      field('Repository (owner/name)', 'repo', config.repo),
      field('Branch', 'ref', config.ref, { list: 'refs' }),
      h('datalist', { id: 'refs' }, ...refs.map((r) => h('option', { value: r }))),
      field('Pinned commit (empty: the latest on the branch)', 'pin', config.pin ?? ''),
      h('small', {}, s.commit ? `Loaded ${s.commit.slice(0, 20)}` : 'Nothing loaded'),
      s.stats &&
        h(
          'small',
          {},
          `${s.stats.files} files, ${s.stats.compiled} compiled in ${Math.round(s.stats.compileMs)} ms`,
        ),
    ),
    drafts.length > 0 &&
      h(
        'fieldset',
        {},
        h('legend', {}, 'Drafts on this device'),
        ...drafts.map((b) => check(`draft:${b}`, b, config.drafts.includes(b))),
      ),
    h(
      'fieldset',
      {},
      h('legend', {}, 'Extensions'),
      ...s.found.map((id) =>
        h(
          'div',
          {},
          check(
            `on:${id}`,
            id,
            !config.disabled.includes(id),
            running.has(id) ? 'running' : config.disabled.includes(id) ? 'off' : '',
          ),
          ...(problems.get(id) ?? []).map((p) => h('p', { class: 'problem' }, p)),
        ),
      ),
      ...s.bundled.map((id) =>
        h('small', {}, `${id}: in the kernel bundle${running.has(id) ? ', running' : ''}`),
      ),
    ),
    secretRows.length > 0 && h('fieldset', {}, h('legend', {}, 'Secrets'), ...secretRows),
    h('div', {}, h('button', { type: 'submit' }, 'Save and start')),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const data = new FormData(form as HTMLFormElement);
      const text = (k: string) => String(data.get(k) ?? '').trim();
      await s.config.update((c) => ({
        ...c,
        repo: text('repo') || c.repo,
        ref: text('ref') || c.ref,
        pin: text('pin') || undefined,
        disabled: s.found.filter((id) => !data.has(`on:${id}`)),
        drafts: drafts.filter((b) => data.has(`draft:${b}`)),
      }));
      for (const [k, v] of data) {
        if (!(k.startsWith('secret:') && typeof v === 'string' && v !== '')) continue;
        const [ext, name] = k.slice('secret:'.length).split('/');
        // biome-ignore lint/performance/noAwaitInLoops: a few secrets, one at a time
        if (v.trim() === '') await s.secrets.forget(ext, name);
        else await s.secrets.set(ext, name, v.trim());
      }
      location.href = location.pathname;
    })();
  });

  const style = h('style');
  style.textContent = css;
  document.head.append(style);
  (document.getElementById('pip') ?? document.body).replaceChildren(form);
}

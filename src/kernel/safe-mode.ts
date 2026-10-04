// Safe mode: a bare screen, in plain DOM and part of the kernel, that works whatever an extension does.
// From here: choose the repo and branch, pin a commit (a rollback), and turn extensions and drafts
// off. Secrets are the secrets extension's.
import type { Booted } from './boot.ts';

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

export async function safeMode(s: Booted) {
  const config = s.config.get();
  const refs = s.src ? await s.src.refs(config.repo).catch(() => [] as string[]) : [];
  // The drafts this device tries, and with a source provider every other one there is.
  const drafts = [...new Set([...config.drafts, ...refs.filter((r) => r.startsWith('draft/'))])];
  const problems = new Map(s.refused.map((r) => [r.id, r.problems]));
  for (const [id, p] of s.kernel.problems()) problems.set(id, p);
  const running = new Set(s.kernel.running().map((r) => r.id));

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

  const form = h(
    'form',
    { class: 'safe' },
    h('h1', {}, 'Vaulter: safe mode'),
    s.safe?.reason && h('p', { class: 'problem' }, s.safe.reason),
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
          ...s.kernel.errors
            .of(id)
            .slice(-3)
            .map((e) =>
              h('small', {}, `${new Date(e.at).toLocaleString()} · ${e.where}: ${e.message}`),
            ),
        ),
      ),
    ),
    h('div', {}, h('button', { type: 'submit' }, 'Save and start')),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const data = new FormData(form as HTMLFormElement);
      const text = (k: string) => String(data.get(k) ?? '').trim();
      // The same changes the kernel contract makes, one at a time: what isn't on the form stays.
      await s.config.setSource({ repo: text('repo'), ref: text('ref'), pin: text('pin') || null });
      for (const id of s.found) await s.config.setEnabled(id, data.has(`on:${id}`));
      for (const b of drafts) await s.config.tryDraft(b, data.has(`draft:${b}`));
      location.href = location.pathname;
    })();
  });

  const style = h('style');
  style.textContent = css;
  document.head.append(style);
  (document.getElementById('vaulter') ?? document.body).replaceChildren(form);
}

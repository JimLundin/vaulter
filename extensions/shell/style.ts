// The shell's stylesheet. Extensions are compiled at runtime, so there is no build step to generate CSS
// for them: views use plain semantic HTML, and the shell styles it.
export const css = `
:root {
  color-scheme: light dark;
  --bg: light-dark(#fbfaf7, #161615);
  --fg: light-dark(#1d1c1a, #e9e7e2);
  --muted: light-dark(#6d6a63, #9b978e);
  --line: light-dark(#e4e1da, #2c2b28);
  --card: light-dark(#ffffff, #1f1e1c);
  --accent: light-dark(#2f5d50, #8cc5b2);
  font: 16px/1.5 system-ui, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); }
a { color: var(--accent); }
.pip-frame { display: grid; grid-template-columns: 14rem 1fr; min-height: 100dvh; }
.pip-nav { display: flex; flex-direction: column; gap: .25rem; padding: 1rem; border-right: 1px solid var(--line); }
.pip-nav a { text-decoration: none; color: var(--fg); padding: .35rem .5rem; border-radius: .4rem; }
.pip-nav a[aria-current] { background: var(--line); }
.pip-brand { font-weight: 600; margin-bottom: .75rem; }
.pip-primary { display: contents; }
.pip-safe { margin-top: auto; font-size: .85rem; color: var(--muted) !important; }
.pip-page { padding: 1.5rem 2rem 4rem; max-width: 48rem; width: 100%; }
.pip-page > header { display: flex; align-items: center; gap: 1rem; }
.pip-page > header h1 { margin: 0 auto 1rem 0; font-size: 1.6rem; }
.pip-source { margin-top: 2rem; font-size: .8rem; color: var(--muted); }
.pip-toasts { position: fixed; bottom: 1rem; left: 50%; translate: -50%; display: grid; gap: .5rem; }
.pip-toasts > div { background: var(--fg); color: var(--bg); padding: .5rem 1rem; border-radius: .5rem; }
button { font: inherit; padding: .4rem .9rem; border-radius: .45rem; border: 1px solid var(--line); background: var(--card); color: var(--fg); cursor: pointer; }
button[data-slot="primary"], button[type="submit"] { background: var(--accent); color: var(--bg); border-color: transparent; }
input, textarea, select { font: inherit; width: 100%; padding: .5rem .65rem; border-radius: .45rem; border: 1px solid var(--line); background: var(--card); color: var(--fg); }
textarea { min-height: 6rem; resize: vertical; }
form { display: grid; gap: .6rem; margin-bottom: 1.5rem; }
label { display: grid; gap: .25rem; font-size: .9rem; color: var(--muted); }
ul.pip-list { list-style: none; padding: 0; margin: 0; display: grid; gap: .5rem; }
ul.pip-list > li { background: var(--card); border: 1px solid var(--line); border-radius: .6rem; padding: .75rem 1rem; }
time, small { color: var(--muted); font-size: .85rem; }
.pip-prose { white-space: pre-wrap; }
@media (max-width: 40rem) {
  .pip-frame { grid-template-columns: 1fr; padding-bottom: 4rem; }
  .pip-nav { position: fixed; inset: auto 0 0 0; flex-direction: row; align-items: center; justify-content: space-around; border: 0; border-top: 1px solid var(--line); background: var(--bg); padding: .5rem; z-index: 1; }
  .pip-brand, .pip-safe { display: none; }
  .pip-page { padding: 1rem; }
  .pip-toasts { bottom: 5rem; }
}
`;

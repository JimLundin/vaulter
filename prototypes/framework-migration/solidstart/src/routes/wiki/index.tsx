/** @jsxImportSource solid-js */
import { createSignal, For } from 'solid-js';
import { A, useNavigate } from '@solidjs/router';
import { Title } from '@solidjs/meta';
import { useVault } from '../../lib/session';
export default function Wiki() {
  const session = useVault(); const navigate = useNavigate(); const [title, setTitle] = createSignal('');
  async function create() { const vault = session.vault(); if (!vault || !title().trim()) return; const id = await vault.createPage(title()); setTitle(''); navigate(`/wiki/${encodeURIComponent(id)}/`); }
  return <><Title>Wiki · SolidStart prototype</Title><h2>Wiki</h2><p>Runtime Record identities, projected through the existing Wiki module.</p>
    <form class="row" onSubmit={(event) => { event.preventDefault(); void create(); }}><input aria-label="New Wiki title" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} placeholder="New page title"/><button disabled={!session.vault()}>Create page</button></form>
    <ul><For each={session.reading().pages}>{(page) => <li><A href={`/wiki/${encodeURIComponent(page.id)}/`}>{page.title}</A><p>{page.summary}</p></li>}</For></ul></>;
}

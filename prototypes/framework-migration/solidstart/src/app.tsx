/** @jsxImportSource solid-js */
import { Router, A } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { MetaProvider } from '@solidjs/meta';
import { createSignal, For, onMount, onCleanup, Show, Suspense } from 'solid-js';
import { createSession, VaultContext } from './lib/session';
import Conversation from './lib/Conversation';
import '@prototype/style.css';
export default function App() {
  return <MetaProvider><Router root={(props) => {
    const session = createSession();
    const [search, setSearch] = createSignal('');
    onMount(() => void session.start()); onCleanup(() => session.dispose());
    return <VaultContext.Provider value={session}>
      <header><h1>Vaulter · SolidStart</h1><nav><A href="/wiki/">Wiki</A><A href="/tasks/">Tasks</A></nav><input class="search" aria-label="Search Wiki" placeholder="Search Wiki" value={search()} onInput={(event) => setSearch(event.currentTarget.value)}/><span class="notice">Throwaway · memory only</span></header>
      <Show when={search()}><section class="page" aria-label="Search results"><For each={session.reading().pages.filter((page) => page.title.toLowerCase().includes(search().toLowerCase()))}>{(page) => <p><A href={`/wiki/${encodeURIComponent(page.id)}/`}>{page.title}</A></p>}</For></section></Show>
      <main><section class="page"><Show when={session.error()}><p class="error">{session.error()}</p></Show><Suspense>{props.children}</Suspense></section><Conversation session={session}/></main>
    </VaultContext.Provider>;
  }}><FileRoutes /></Router></MetaProvider>;
}

<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { createSession } from '../lib/session.svelte';
  import Conversation from '../lib/Conversation.svelte';
  import '@prototype/style.css';
  let { children } = $props();
  let search = $state('');
  const session = createSession();
  setContext('vault', session);
  onMount(() => { void session.start(); return () => session.dispose(); });
  const matches = $derived(session.reading.pages.filter((page) => page.title.toLowerCase().includes(search.toLowerCase())));
</script>
<header><h1>Vaulter · SvelteKit</h1><nav><a href="/wiki/">Wiki</a><a href="/tasks/">Tasks</a></nav><input class="search" aria-label="Search Wiki" placeholder="Search Wiki" bind:value={search}/><span class="notice">Throwaway · memory only</span></header>
{#if search}<section class="page" aria-label="Search results">{#each matches as page}<p><a href={`/wiki/${encodeURIComponent(page.id)}/`}>{page.title}</a></p>{/each}</section>{/if}
<main><section class="page">{#if session.error}<p class="error">{session.error}</p>{/if}{@render children()}</section><Conversation {session}/></main>

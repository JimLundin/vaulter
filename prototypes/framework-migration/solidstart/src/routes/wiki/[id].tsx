/** @jsxImportSource solid-js */
import { For, Show } from 'solid-js';
import { A, useParams } from '@solidjs/router';
import { Title } from '@solidjs/meta';
import { useVault } from '../../lib/session';
export default function WikiRecord() {
  const session = useVault(); const params = useParams(); const record = () => session.reading().pages.find((page) => page.id === params.id);
  return <><Title>{record()?.title ?? 'Wiki'} · SolidStart prototype</Title><Show when={record()} fallback={<><h2>Record unavailable</h2><p>A memory-only reload resets the Vault; runtime routing still resolves this URL.</p></>}>{(page) => <><h2>{page().title}</h2><p>{page().summary}</p><For each={page().blocks}>{(block) => <p>{String(block.data.text ?? '')}</p>}</For><pre class="state">Record: {page().id}</pre></>}</Show><A href="/wiki/">Back to Wiki</A></>;
}

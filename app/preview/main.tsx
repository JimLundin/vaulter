import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import '../ui/kit/styles.css';
import { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { OpenProduct } from '../product.tsx';
import { startTheme, Text } from '../ui/kit/index.ts';
import { useWriter, applyOverlay } from '../vault/changes/writer.ts';
import { liveVault } from '../vault/index.ts';
import { memoryBackend } from '../vault/storage/memory.ts';
import { vaultRules } from '../vault/validation/rules.ts';
import type { Head } from '../vault/storage/backend.ts';
import { sampleFiles, note } from './data.ts';
import { previewModel } from './model.ts';

const memory = memoryBackend(sampleFiles);
const initial = memory.backend.write!(
  [
    {
      path: 'Garden studio.md',
      text: note(
        'Garden studio',
        'A quiet place for making things. Leave the afternoons free for focused work.',
      ),
    },
  ],
  'Refine the garden studio note',
  async (base, after) => {
    const problems = await vaultRules.problems(base, after);
    if (problems.length) throw new Error(problems.join('\n'));
  },
);

function Preview({ initialHead }: { initialHead: Head }) {
  const [head, setHead] = useState(initialHead);
  const writer = useWriter(memory.backend, vaultRules, head, setHead);
  const current = useRef(writer);
  current.current = writer;
  const vault = useMemo(() => liveVault(() => current.current), []);
  const files = applyOverlay(head.files, writer.overlay);
  return (
    <OpenProduct
      session={{
        vault,
        files,
        status: { kind: 'synced', at: Date.now() },
        locked: null,
        signOut: null,
        secrets: null,
        blocked: null,
      }}
      model={async () => previewModel}
      preview={{
        label: `Design preview · ${(import.meta.env.VITE_PREVIEW_COMMIT || 'local').slice(0, 7)}`,
        reset: () => location.reload(),
      }}
    />
  );
}

startTheme();
const root = createRoot(document.getElementById('app')!);
initial
  .then(({ head }) => root.render(<Preview initialHead={head} />))
  .catch((error: unknown) => root.render(<Text tone="danger">{String(error)}</Text>));

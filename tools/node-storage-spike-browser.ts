// PROTOTYPE: self-contained browser shell, bundled into demo.html with Dexie.
import type { NodeAddress } from '../app/vault/nodes/model.ts';
import {
  actionLabels,
  seed,
  walkthrough,
  type Action,
} from '../app/vault/nodes/spike/scenarios.ts';
import {
  dexieSpikeStore,
  memorySpikeStore,
  citationView,
  type SpikeStore,
} from '../app/vault/nodes/spike/prototype.ts';

const showError = (error: unknown) => {
  get('outcome').textContent = String(error);
};
const addressLabel = (address: NodeAddress) =>
  `${address.node}${address.transaction === undefined ? ' · identity' : ` @ ${address.transaction}`}`;
const databaseName = 'PROTOTYPE-vaulter-node-storage-addresses-wipe-me';
const get = (id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing demo element: ${id}`);
  return element;
};
const button = (label: string, callback: () => void | Promise<void>) => {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = label;
  element.onclick = () => {
    perform(callback).catch(showError);
  };
  return element;
};
let store: SpikeStore = memorySpikeStore();
let guide = walkthrough(store);
let persistent = false;
let selectedSequence: number | undefined;
let busy = false;

async function perform(callback: () => void | Promise<void>) {
  if (busy) return;
  busy = true;
  document.body.setAttribute('aria-busy', 'true');
  try {
    await callback();
  } catch (error) {
    get('outcome').textContent = String(error);
  } finally {
    try {
      await render();
    } finally {
      busy = false;
      document.body.setAttribute('aria-busy', 'false');
    }
  }
}

async function render() {
  const current = await store.snapshot();
  const snapshot = await store.snapshot(selectedSequence);
  get('backend').textContent = persistent
    ? 'Encrypted IndexedDB · survives reopen'
    : 'Memory · resets on reload';
  get('sequence').textContent =
    `Viewing transaction ${snapshot.sequence} · latest is ${current.sequence}`;
  const transactions = await store.history({ limit: 100 });
  const differences = await Promise.all(transactions.map((t) => store.changes(t.id)));
  const transactionSnapshots = await Promise.all(
    transactions.map((t) => store.snapshot(t.sequence)),
  );
  const identities = new Set(differences.flatMap((changes) => changes.map((d) => d.node)));
  const nodes = [...identities].sort().map((id) => snapshot.get(id));
  const table = get('nodes');
  table.replaceChildren();
  for (const node of nodes) {
    if (!node) continue;
    const row = document.createElement('tr');
    const data = node.data === null ? 'Deleted' : JSON.stringify(node.data);
    for (const value of [
      node.key.node,
      node.placement?.parent ?? '—',
      node.connection ? addressLabel(node.connection.source) : '—',
      node.connection ? addressLabel(node.connection.target) : '—',
      node.placement?.order ?? '—',
      node.key.transaction,
      data,
    ]) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    table.append(row);
  }
  for (const [id, root] of [
    ['pageA', 'page-a'],
    ['pageB', 'page-b'],
    ['chat', 'conversation'],
  ]) {
    const lines: string[] = [];
    const visit = (address: NodeAddress, depth: number, path: Set<string>) => {
      const node = snapshot.resolve(address);
      const key = node ? JSON.stringify(node.key) : addressLabel(address);
      if (path.has(key)) {
        lines.push(`${'  '.repeat(depth)}[recursive reference]`);
        return;
      }
      if (!node || node.data === null) {
        lines.push(`${'  '.repeat(depth)}[content deleted]`);
        return;
      }
      const next = new Set(path).add(key);
      const { data } = node;
      lines.push(
        `${'  '.repeat(depth)}${data.title ?? data.text ?? data.kind ?? address.node}${data.status ? ` (${data.status})` : ''}`,
      );
      if (Array.isArray(data.parts))
        for (const part of data.parts)
          if (part && typeof part === 'object' && 'text' in part)
            lines.push(`${'  '.repeat(depth + 1)}${part.text}`);
      if (data.kind === 'citation') {
        const citation = citationView(snapshot, node);
        lines.push(`${'  '.repeat(depth + 1)}Evidence: “${citation.quote}”`);
        lines.push(
          `${'  '.repeat(depth + 1)}Claim: ${citation.source}; evidence: ${citation.target}`,
        );
      }
      for (const child of snapshot.children(node.key.node))
        visit({ node: child.key.node }, depth + 1, next);
      if (node.connection && data.kind !== 'citation')
        visit(node.connection.target, depth + 1, next);
    };
    if (snapshot.get(root)) visit({ node: root }, 0, new Set());
    else lines.push('No conversation recorded yet.');
    get(id).textContent = lines.join('\n');
  }
  const history = get('history');
  history.replaceChildren();
  for (const [index, transaction] of transactions.entries()) {
    const changes = differences[index];
    const item = document.createElement('li');
    const pick = button(
      `${transaction.sequence} · ${transaction.kind.scope} / ${transaction.kind.action}${transaction.message === null ? '' : ` · ${transaction.message}`}`,
      () => {
        selectedSequence = transaction.sequence;
        get('outcome').textContent = `Historical view at ${transaction.sequence}`;
        get('diff').textContent = JSON.stringify(changes, null, 2);
      },
    );
    const label = document.createElement('small');
    label.textContent = `By ${transactionSnapshots[index].get(transaction.recordedBy)?.data?.name ?? transaction.recordedBy} · Origin ${transaction.origin ?? 'direct action'} · Changed nodes: ${changes.map((d) => d.node).join(', ')}`;
    item.append(pick, label);
    history.append(item);
  }
}

const scenarios: { name: string; description: string; actions: Action[] }[] = [
  {
    name: 'Chat and undo',
    description: 'Accept a message, commit content, finish the reply, then undo only the content.',
    actions: ['send', 'commit', 'complete', 'undo'],
  },
  {
    name: 'Stop after commit',
    description:
      'Stopping a reply records its partial output. The earlier content transaction stays committed.',
    actions: ['send', 'checkpoint', 'commit', 'stop'],
  },
  {
    name: 'Shared deletion',
    description:
      'Delete shared content without rewriting either appearance; restore it and both placements recover.',
    actions: ['delete', 'restore', 'detach'],
  },
  {
    name: 'Local placement',
    description:
      'Move a group without versioning descendants, then create an independent appearance.',
    actions: ['move', 'independent'],
  },
  {
    name: 'Container deletion',
    description:
      'Deleting the notes group hides its descendants without changing their versions. Restoring it reveals them again.',
    actions: ['deleteGroup', 'restoreGroup'],
  },
  {
    name: 'Exact citations',
    description:
      'Record a citation, append new evidence and a revised claim, then delete the evidence. The citation retains both original versions. Moving it changes only its placement.',
    actions: ['cite', 'commit', 'reviseClaim', 'delete', 'moveCitation'],
  },
  {
    name: 'Response citation',
    description:
      'Cite a recorded response checkpoint, then stop the response. Its citation keeps the checkpoint while chat displays the terminal version. Undo removes the claim and citation while retaining chat.',
    actions: ['send', 'checkpoint', 'citeResponse', 'stop', 'undo'],
  },
  {
    name: 'Invalid address',
    description:
      'An existing node and an existing transaction do not necessarily identify a version. The invalid pair rejects the complete transaction.',
    actions: ['commit', 'invalidAddress'],
  },
  {
    name: 'Stale edit',
    description: 'A newer paragraph edit makes a two-node stale transaction fail as a whole.',
    actions: ['stale'],
  },
];

async function act(action: Action) {
  selectedSequence = undefined;
  const result = await guide.execute(action);
  get('outcome').textContent =
    typeof result === 'string'
      ? result
      : `Recorded transaction ${result.sequence}: ${result.message}`;
  if (typeof result !== 'string')
    get('diff').textContent = JSON.stringify(await store.changes(result.id), null, 2);
}

get('actions').append(
  ...Object.entries(actionLabels).map(([action, label]) =>
    button(label, () => act(action as Action)),
  ),
);
for (const scenario of scenarios)
  get('tabs').append(
    button(scenario.name, async () => {
      await seed(store);
      guide = walkthrough(store);
      selectedSequence = undefined;
      get('walkthrough').replaceChildren();
      const text = document.createElement('p');
      text.textContent = scenario.description;
      get('walkthrough').append(text);
      const steps = scenario.actions.map((action, index) => {
        const step = button(`${index + 1}. ${actionLabels[action]}`, async () => {
          await act(action);
          step.disabled = true;
          if (steps[index + 1]) steps[index + 1].disabled = false;
        });
        step.disabled = index !== 0;
        return step;
      });
      get('walkthrough').append(...steps);
      get('outcome').textContent = 'Walkthrough reset to fictional content.';
    }),
  );
get('memory').onclick = () => {
  perform(async () => {
    store.close();
    store = memorySpikeStore();
    persistent = false;
    await seed(store);
    guide = walkthrough(store);
    selectedSequence = undefined;
    get('outcome').textContent = 'New memory store.';
  }).catch(showError);
};
get('dexie').onclick = () => {
  perform(async () => {
    store.close();
    store = await dexieSpikeStore(databaseName);
    persistent = true;
    if ((await store.snapshot()).sequence === 0) await seed(store);
    guide = walkthrough(store);
    selectedSequence = undefined;
    get('outcome').textContent =
      'Opened scratch IndexedDB history. Content and structural references are encrypted.';
  }).catch(showError);
};
get('reopen').onclick = () => {
  perform(async () => {
    store.close();
    store = persistent ? await dexieSpikeStore(databaseName) : memorySpikeStore();
    if (!persistent) await seed(store);
    guide = walkthrough(store);
    selectedSequence = undefined;
    get('outcome').textContent = persistent
      ? 'Closed and reopened the database; history retained.'
      : 'Memory store recreated; prior history lost.';
  }).catch(showError);
};
get('reset').onclick = () => {
  perform(async () => {
    await seed(store);
    guide = walkthrough(store);
    selectedSequence = undefined;
    get('outcome').textContent = 'Scratch content reset.';
  }).catch(showError);
};
get('latest').onclick = () => {
  perform(() => {
    selectedSequence = undefined;
  }).catch(showError);
};
seed(store).then(render).catch(showError);

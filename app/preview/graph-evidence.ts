// Fictional evidence scenario, installed only for the explicit Graph comparison.
import type { JsonObject } from '@/vault/nodes/model.ts';
import type { NodeChange, NodeCommit, NodeStore } from '@/vault/nodes/store.ts';

export async function seedGraphEvidence(nodes: NodeStore) {
  if ((await nodes.snapshot()).get('preview:graph-topic')) return;
  const create = (node: string, data: JsonObject, parent?: string, order = 'a'): NodeChange => ({
    node,
    data,
    placement: parent ? { parent, order } : null,
    connection: null,
    expected: null,
  });
  const request = (id: string, changes: NodeChange[]): NodeCommit => ({
    id,
    changes,
    recordedBy: 'preview:wiki-owner',
    origin: null,
    undoOf: null,
    kind: { scope: 'node', action: 'create' },
    message: 'Fictional Graph evidence scenario',
  });
  const claims = [
    'Protect mornings for focused hand-tool work.',
    'Keep the workbench clear between sessions.',
    'A wall-mounted tool rack would make the studio easier to use.',
  ];
  const passages = [
    'I use chisels and a hand plane most mornings. It is the only part of the day when I can work without interruptions. The power tools are for occasional afternoon projects.',
    'There is not room to leave everything out. When tools stay on the bench overnight, I spend the next session moving them before I can start.',
  ];
  const original = await nodes.commit(
    request('preview:graph-evidence-original', [
      create('preview:graph-topic', {
        kind: 'page',
        title: 'Studio routine',
        summary:
          'A routine for focused work in a small studio. Two statements have citations; a proposed tool rack still needs evidence.',
      }),
      ...claims.flatMap((text, index) => [
        create(
          `preview:graph-claim:${index}`,
          { kind: 'paragraph' },
          'preview:graph-topic',
          String(index),
        ),
        create(
          `preview:graph-words:${index}`,
          { kind: 'run', text },
          `preview:graph-claim:${index}`,
        ),
      ]),
      ...passages.flatMap((text, index) => [
        create(`preview:graph-source:${index}`, {
          kind: 'resource',
          title: index ? 'Space and storage notes' : 'Morning work conversation',
          url: `https://example.invalid/graph-source/${index}`,
        }),
        create(
          `preview:graph-passage:${index}`,
          { kind: 'run', text },
          `preview:graph-source:${index}`,
        ),
      ]),
      create(
        'preview:graph-open-question',
        {
          kind: 'question',
          text: 'Which tools should stay within reach, and which should be stored?',
        },
        'preview:graph-topic',
        'q',
      ),
    ]),
  );
  await nodes.commit(
    request(
      'preview:graph-evidence-citations',
      passages.flatMap((text, index): NodeChange[] => [
        {
          ...create(
            `preview:graph-citation:${index}`,
            {
              kind: 'cite',
              unit: 'utf16',
              claim: { sequence: original.sequence, start: 0, end: claims[index].length },
              passage: { sequence: original.sequence, start: 0, end: text.length },
            },
            `preview:graph-claim:${index}`,
            'z',
          ),
          connection: {
            source: { node: `preview:graph-claim:${index}`, transaction: original.id },
            target: { node: `preview:graph-source:${index}`, transaction: original.id },
          },
        },
        {
          ...create(
            `preview:graph-reference:${index}`,
            { kind: 'cite', scope: 'page', sequence: original.sequence },
            'preview:graph-topic',
            `z${index}`,
          ),
          connection: {
            source: { node: 'preview:graph-topic', transaction: original.id },
            target: { node: `preview:graph-source:${index}`, transaction: original.id },
          },
        },
      ]),
    ),
  );
  const snapshot = await nodes.snapshot();
  const before = snapshot.get('preview:graph-passage:0')!;
  await nodes.commit(
    request('preview:graph-evidence-change', [
      {
        node: before.key.node,
        expected: before.key.transaction,
        placement: before.placement,
        connection: before.connection,
        data: {
          kind: 'run',
          text: 'My schedule changed. Mornings now include calls; afternoons are the quietest time for hand-tool work.',
        },
      },
    ]),
  );
}

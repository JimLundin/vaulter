// Fictional retained history; production readers interpret every page, claim and source.
import type { JsonObject } from '../vault/nodes/model.ts';
import type { NodeChange, NodeCommit, NodeStore } from '../vault/nodes/store.ts';

const create = (node: string, data: JsonObject, parent?: string, order = 'a'): NodeChange => ({
  node,
  expected: null,
  placement: parent ? { parent, order } : null,
  connection: null,
  data,
});
const request = (id: string, changes: NodeChange[]): NodeCommit => ({
  id,
  recordedBy: 'preview:wiki-owner',
  origin: null,
  undoOf: null,
  kind: { scope: 'node', action: 'create' },
  message: 'Fictional Wiki evidence',
  changes,
});
const claim = ['Keep mornings free.', 'Afternoons are flexible.'];
const contexts = claim.map(
  (text) => 'Earlier plans. '.repeat(40) + text + ' Later details.'.repeat(40),
);

/** Idempotent sample installation also upgrades an existing fictional tab journal. */
export async function seedPreviewRecords(nodes: NodeStore): Promise<void> {
  const snapshot = await nodes.snapshot();
  if (!snapshot.get('preview:wiki-owner')) {
    await nodes.commit(
      request('preview:wiki-pages', [
        create('preview:wiki-owner', { kind: 'actor', name: 'Fictional owner' }),
        ...['Garden studio', 'Slow mornings', 'Reading list'].flatMap((title, index) => [
          create(`preview:page:${index}`, {
            kind: 'page',
            title,
            summary: 'Room for the things that matter.',
          }),
          create(`preview:paragraph:${index}`, { kind: 'paragraph' }, `preview:page:${index}`),
          create(
            `preview:run:${index}`,
            { kind: 'run', text: 'Leave the mornings free for making things.' },
            `preview:paragraph:${index}`,
          ),
        ]),
      ]),
    );
  }
  let history = await nodes.history({ limit: Number.MAX_SAFE_INTEGER });
  let original = history.find((transaction) => transaction.id === 'preview:evidence-original');
  if (!original) {
    const current = await nodes.snapshot();
    const changes: NodeChange[] = [
      create('preview:creative', {
        kind: 'term',
        scheme: 'tag',
        key: 'creative',
        label: 'Creative work',
      }),
      {
        ...create(
          'preview:creative-tag',
          { kind: 'relationship', predicate: 'tag' },
          'preview:page:0',
        ),
        connection: { source: { node: 'preview:page:0' }, target: { node: 'preview:creative' } },
      },
      create(
        'preview:question',
        { kind: 'question', text: 'Which tools should stay?' },
        'preview:page:0',
        'd',
      ),
    ];
    const before = current.get('preview:run:0')!;
    changes.push({
      ...create(
        'preview:run:0',
        { kind: 'run', text: 'Keep ', marks: ['emphasis'] },
        'preview:paragraph:0',
      ),
      expected: before.key.transaction,
    });
    changes.push(
      create(
        'preview:claim-tail',
        { kind: 'run', text: 'mornings free.', marks: ['strong'] },
        'preview:paragraph:0',
        'b',
      ),
    );
    changes.push(create('preview:flexible', { kind: 'paragraph' }, 'preview:page:0', 'b'));
    changes.push(
      create('preview:flexible-words', { kind: 'run', text: claim[1] }, 'preview:flexible'),
    );
    for (let index = 0; index < 12; index++) {
      const resource = `preview:source:${index}`;
      changes.push(
        create(resource, {
          kind: 'resource',
          title: index === 0 ? 'Studio plans' : `Planning note ${index + 1}`,
          url: `https://example.invalid/planning/${index + 1}`,
        }),
      );
      changes.push(create(`preview:source-paragraph:${index}`, { kind: 'paragraph' }, resource));
      changes.push(
        create(
          `preview:source-words:${index}`,
          {
            kind: 'run',
            text: contexts[index < 2 ? index : 0],
          },
          `preview:source-paragraph:${index}`,
        ),
      );
    }
    original = await nodes.commit(request('preview:evidence-original', changes));
  }
  if (!history.some((transaction) => transaction.id === 'preview:evidence-citations')) {
    const changes: NodeChange[] = claim.map((text, index) => {
      const node = index === 0 ? 'preview:paragraph:0' : 'preview:flexible';
      return {
        ...create(
          `preview:claim-citation:${index}`,
          {
            kind: 'cite',
            unit: 'utf16',
            claim: { sequence: original.sequence, start: 0, end: text.length },
            passage: { sequence: original.sequence, start: 600, end: 600 + text.length },
          },
          node,
          'z',
        ),
        connection: {
          source: { node, transaction: index === 0 ? 'preview:wiki-pages' : original.id },
          target: { node: `preview:source:${index}`, transaction: original.id },
        },
      };
    });
    changes.push(
      ...Array.from(
        { length: 12 },
        (_, index): NodeChange => ({
          ...create(
            `preview:page-source:${index}`,
            { kind: 'cite', scope: 'page', sequence: original.sequence },
            'preview:page:0',
            `z${String(index).padStart(2, '0')}`,
          ),
          connection: {
            source: { node: 'preview:page:0', transaction: 'preview:wiki-pages' },
            target: { node: `preview:source:${index}`, transaction: original.id },
          },
        }),
      ),
    );
    await nodes.commit(request('preview:evidence-citations', changes));
  }
  history = await nodes.history({ limit: Number.MAX_SAFE_INTEGER });
  if (!history.some((transaction) => transaction.id === 'preview:evidence-later')) {
    const current = await nodes.snapshot();
    await nodes.commit(
      request(
        'preview:evidence-later',
        [0, 1].map((index) => {
          const before = current.get(index === 0 ? 'preview:source-words:0' : 'preview:source:1')!;
          return {
            node: before.key.node,
            expected: before.key.transaction,
            placement: index === 1 ? null : before.placement,
            connection: before.connection,
            data:
              index === 1
                ? null
                : {
                    ...before.data,
                    text: 'Later plan: afternoons are now reserved for making things.',
                  },
          };
        }),
      ),
    );
  }
  if (!history.some((transaction) => transaction.id === 'preview:question-proposals')) {
    const view = await nodes.snapshot();
    const question = view.get('preview:question')!;
    const transaction = 'preview:question-proposals';
    // Prewritten fictional generation output exercises the production suggestion contract.
    await nodes.commit(
      request(transaction, [
        create('preview:tool-source', {
          kind: 'content',
          title: 'Studio tools conversation',
          text: 'I use chisels and a hand plane most mornings. The power tools are for occasional projects, and there is not room to leave everything out.',
        }),
        create('preview:tool-knowledge', { kind: 'paragraph' }, 'preview:page:0', 'c'),
        create(
          'preview:tool-knowledge-text',
          { kind: 'run', text: 'Leave the workbench clear at the end of each session.' },
          'preview:tool-knowledge',
        ),
        {
          node: question.key.node,
          expected: question.key.transaction,
          data: {
            ...question.data,
            suggestions: [
              {
                title: 'Keep hand tools close',
                text: 'Keep the chisels and hand plane within reach. Store the power tools until they are needed, and clear the workbench after each session.',
                reason:
                  'The source describes daily hand-tool work and occasional power-tool use; the studio notes ask for a clear bench.',
              },
              {
                title: 'Store everything between sessions',
                text: 'Store every tool after each session, with the chisels and hand plane together in an easy-to-reach drawer.',
                reason:
                  'The source says there is not room to leave everything out; the existing notes prioritise a clear workbench.',
              },
            ],
          },
          placement: question.placement,
          connection: question.connection,
        },
        ...[
          ['preview:question-source', 'generated-from', 'preview:tool-source'],
          ['preview:question-knowledge', 'informed-by', 'preview:tool-knowledge-text'],
        ].map(
          ([node, predicate, target], index): NodeChange => ({
            ...create(node, { kind: 'relationship', predicate }, question.key.node, String(index)),
            connection: {
              source: { node: question.key.node, transaction },
              target: { node: target, transaction },
            },
          }),
        ),
      ]),
    );
  }
}

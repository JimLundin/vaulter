// Comparison-only sample Vault: connected topics, shared sources and a deliberately busy topic.
import type { JsonObject } from '../vault/nodes/model.ts';
import type { NodeChange, NodeCommit, NodeStore } from '../vault/nodes/store.ts';

const topicSamples = [
  [
    'Hand-tool storage',
    'Studio',
    [
      'Keep the chisels close to the bench.',
      'Store the hand plane on its side.',
      'Separate sharp tools from measuring tools.',
      'Return each tool after a session.',
      'Use labelled drawers for small fittings.',
      'Keep occasional power tools in the cupboard.',
      'A magnetic strip might replace the chisel drawer.',
      'A second cabinet might solve winter storage.',
    ],
    [
      'How much storage fits without blocking the doorway?',
      'Would a tool rack expose blades to damp air?',
    ],
  ],
  [
    'Lighting the workshop through the darker winter months',
    'Studio',
    [
      'Put task lighting on the left of the bench.',
      'Use a separate lamp for finishing work.',
      'Keep daylight available for matching colours.',
      'Avoid glare from the overhead light.',
      'Check small joints under angled light.',
      'Turn off task lamps when leaving the studio.',
      'A ceiling track might cover the whole room.',
      'Warmer lighting might make evening work easier.',
    ],
    [
      'Does the bench lamp cast a shadow across the cutting line?',
      'Which lamp works with the low ceiling?',
    ],
  ],
  [
    'Workshop ventilation',
    'Studio',
    [
      'Open the door during sanding.',
      'Keep dust collection near the work.',
      'Store finishes in closed containers.',
      'Clean dust before applying oil.',
      'Use the outside table for dusty jobs.',
      'Air the studio after finishing work.',
      'A wall vent might improve winter airflow.',
      'A larger extractor might be quieter at low speed.',
    ],
    [
      'How can the room stay warm while it is being aired?',
      'Where could an extractor discharge safely?',
    ],
  ],
  [
    'Kitchen garden',
    'Garden',
    [
      'Keep frequently picked herbs near the kitchen.',
      'Group crops by watering needs.',
      'Rotate tomatoes out of last year’s bed.',
      'Leave a path wide enough for the wheelbarrow.',
      'Harvest leafy greens before the midday heat.',
      'Record which beds dry out first.',
      'A fourth raised bed might increase the harvest.',
      'Companion planting might reduce insect damage.',
    ],
    [
      'Which crops cope with the afternoon shade?',
      'How much of the garden can be watered from stored rain?',
    ],
  ],
  [
    'Rainwater collection',
    'Garden',
    [
      'Use collected water for the outdoor beds.',
      'Cover stored water against fallen leaves.',
      'Check the overflow after heavy rain.',
      'Empty exposed fittings before freezing weather.',
      'Keep the watering can beside the barrel.',
      'Record how quickly the barrel empties in summer.',
      'A second barrel might cover a dry fortnight.',
      'A pump might make distant beds easier to water.',
    ],
    ['Where should a second barrel stand?', 'Would the roof runoff need a different filter?'],
  ],
  [
    'Composting and soil',
    'Garden',
    [
      'Mix dry leaves with kitchen scraps.',
      'Keep the heap damp during dry weeks.',
      'Leave woody prunings out of the small bin.',
      'Turn the heap when the middle cools.',
      'Use finished compost around established plants.',
      'Record which materials break down slowly.',
      'A second bin might simplify turning.',
      'Leaf mould might suit the shaded bed better.',
    ],
    ['Is the heap getting enough air?', 'Which bed needs compost first?'],
  ],
  [
    'Reading without interruptions',
    'Learning',
    [
      'Keep the phone outside the reading room.',
      'Read difficult books before checking messages.',
      'Write one short note after each session.',
      'Return to marked passages at the weekend.',
      'Keep a small active reading list.',
      'Separate borrowed books from books to annotate.',
      'An e-reader might make travel reading easier.',
      'A reading group might help with difficult texts.',
    ],
    ['Which books deserve a second reading?', 'Does a shorter session improve recall?'],
  ],
  [
    'Turning reading notes into useful ideas',
    'Learning',
    [
      'Connect each note to a question.',
      'Keep the original quotation with the source title.',
      'Separate the author’s claim from personal interpretation.',
      'Revisit notes before starting a project.',
      'Write summaries in your own words.',
      'Record disagreements rather than smoothing them away.',
      'A weekly synthesis might reveal recurring themes.',
      'Voice notes might capture ideas during walks.',
    ],
    ['Which notes have already influenced a project?', 'Where do two sources disagree?'],
  ],
  [
    'A quieter working week',
    'Routine',
    [
      'Batch routine calls into two afternoons.',
      'Keep one morning free of appointments.',
      'Plan the next session before stopping work.',
      'Leave travel time between commitments.',
      'Review commitments on Friday.',
      'Keep the first half hour free of messages.',
      'A four-day schedule might protect longer projects.',
      'A shared calendar might reduce interruptions.',
    ],
    ['Which recurring meetings could move?', 'What changes during the busy season?'],
  ],
  [
    'Rest and walking',
    'Routine',
    [
      'Take a short walk after lunch.',
      'Leave strenuous work for rested days.',
      'Keep a regular stopping time.',
      'Use quiet evenings for low-demand tasks.',
      'Choose the shaded route on hot days.',
      'Notice whether late calls affect sleep.',
      'A longer morning walk might improve focus.',
      'A standing desk might help on wet days.',
    ],
    ['Which routine survives winter weather?', 'Is tiredness linked to schedule or workload?'],
  ],
] as const;
const busyClaims = [
  'Sharpen chisels before starting detailed work.',
  'Keep a notebook beside the bench.',
  'Lay out only the tools needed for the current project.',
  'Mark the next cut before stopping.',
  'Check the room temperature before gluing.',
  'Leave glued pieces undisturbed overnight.',
  'Keep measuring tools away from wood dust.',
  'Use scrap wood to test a new finish.',
  'Photograph completed joints before assembly.',
  'Keep a separate box for offcuts.',
  'Clear the floor at the end of each session.',
  'Move sanding outside when weather allows.',
  'Review the project list before buying materials.',
  'Keep spare blades in a closed case.',
  'A mobile bench might make room for larger projects.',
  'An evening session might suit finishing work.',
  'A shared tool inventory might prevent duplicate purchases.',
];

export async function seedGraphDensity(nodes: NodeStore) {
  if ((await nodes.snapshot()).get('preview:density:topic:0')) return;
  const create = (node: string, data: JsonObject, parent?: string, order = 'a'): NodeChange => ({
    node,
    data,
    expected: null,
    placement: parent ? { parent, order } : null,
    connection: null,
  });
  const request = (id: string, changes: NodeChange[]): NodeCommit => ({
    id,
    changes,
    recordedBy: 'preview:wiki-owner',
    origin: null,
    undoOf: null,
    kind: { scope: 'node', action: 'create' },
    message: 'Fictional Graph density scenario',
  });
  const groups = [...new Set(topicSamples.map(([, group]) => group))];
  const originalChanges: NodeChange[] = [];
  const plans: { claim: string; text: string; source: string; passage: string; start: number }[] =
    [];
  const sharedText = new Map<string, string>();
  for (const group of groups) {
    const text = topicSamples
      .filter(([, entry]) => entry === group)
      .map(([title, , claims]) => `${title}: ${claims[0]} ${claims[1]}`)
      .join('\n');
    sharedText.set(group, text);
    originalChanges.push(
      create(`preview:density:theme:${group}`, {
        kind: 'term',
        scheme: 'tag',
        key: group.toLowerCase(),
        label: group,
      }),
      create(`preview:density:shared:${group}`, {
        kind: 'resource',
        title: `${group} planning conversation`,
        url: `https://example.invalid/density/${group}`,
      }),
      create(
        `preview:density:shared-words:${group}`,
        { kind: 'run', text },
        `preview:density:shared:${group}`,
      ),
    );
  }
  for (const [index, [title, group, claims, questions]] of topicSamples.entries()) {
    const topic = `preview:density:topic:${index}`;
    originalChanges.push(
      create(topic, {
        kind: 'page',
        title,
        summary: `Notes, practical decisions and unresolved proposals about ${title.toLowerCase()}.`,
      }),
    );
    for (let sourceIndex = 0; sourceIndex < 2; sourceIndex++) {
      const text = claims.slice(sourceIndex * 3, sourceIndex * 3 + 3).join('\n');
      const source = `preview:density:source:${index}:${sourceIndex}`;
      originalChanges.push(
        create(source, {
          kind: 'resource',
          title: `${title} — ${sourceIndex === 1 ? 'follow-up notes' : 'first observations'}`,
          url: `https://example.invalid/density/${index}/${sourceIndex}`,
        }),
        create(`${source}:words`, { kind: 'run', text }, source),
      );
    }
    for (const [claimIndex, text] of claims.entries()) {
      const claim = `preview:density:claim:${index}:${claimIndex}`;
      originalChanges.push(
        create(claim, { kind: 'paragraph' }, topic, `c${claimIndex}`),
        create(`${claim}:words`, { kind: 'run', text }, claim),
      );
      if (claimIndex < 6) {
        const sourceIndex = Math.floor(claimIndex / 3);
        const context = claims.slice(sourceIndex * 3, sourceIndex * 3 + 3).join('\n');
        plans.push({
          claim,
          text,
          source: `preview:density:source:${index}:${sourceIndex}`,
          passage: text,
          start: context.indexOf(text),
        });
      }
      if (claimIndex < 2)
        plans.push({
          claim,
          text,
          source: `preview:density:shared:${group}`,
          passage: text,
          start: sharedText.get(group)!.indexOf(text),
        });
    }
    for (const [questionIndex, text] of questions.entries())
      originalChanges.push(
        create(
          `preview:density:question:${index}:${questionIndex}`,
          { kind: 'question', text },
          topic,
          `q${questionIndex}`,
        ),
      );
  }
  originalChanges.push(
    create('preview:density:studio-source', {
      kind: 'resource',
      title: 'Studio practice journal',
      url: 'https://example.invalid/studio-journal',
    }),
    create(
      'preview:density:studio-source:words',
      { kind: 'run', text: busyClaims.slice(0, 13).join('\n') },
      'preview:density:studio-source',
    ),
    create(
      'preview:density:studio-question:0',
      { kind: 'question', text: 'Which changes to the studio routine are worth trying first?' },
      'preview:graph-topic',
      'r',
    ),
    create(
      'preview:density:studio-question:1',
      {
        kind: 'question',
        text: 'Can the room support two people working without sharing the same bench?',
      },
      'preview:graph-topic',
      's',
    ),
  );
  for (const [index, text] of busyClaims.entries()) {
    const claim = `preview:density:studio-claim:${index}`;
    originalChanges.push(
      create(
        claim,
        { kind: 'paragraph' },
        'preview:graph-topic',
        `d${String(index).padStart(2, '0')}`,
      ),
      create(`${claim}:words`, { kind: 'run', text }, claim),
    );
    if (index < 13)
      plans.push({
        claim,
        text,
        source: 'preview:density:studio-source',
        passage: text,
        start: busyClaims.slice(0, 13).join('\n').indexOf(text),
      });
  }
  const studio = (await nodes.snapshot()).get('preview:graph-topic')!;
  originalChanges.push({
    node: studio.key.node,
    expected: studio.key.transaction,
    placement: studio.placement,
    connection: studio.connection,
    data: {
      ...studio.data,
      summary:
        'A routine for focused work in a small studio, with twenty statements, shared evidence and several open proposals.',
    },
  });
  const original = await nodes.commit(request('preview:graph-density-original', originalChanges));
  const edge = (id: string, source: string, target: string, predicate: string): NodeChange => ({
    ...create(id, { kind: 'relationship', predicate }, source, id),
    connection: { source: { node: source }, target: { node: target } },
  });
  const citations: NodeChange[] = plans.map((plan, index) => ({
    ...create(
      `preview:density:citation:${index}`,
      {
        kind: 'cite',
        unit: 'utf16',
        claim: { sequence: original.sequence, start: 0, end: plan.text.length },
        passage: {
          sequence: original.sequence,
          start: plan.start,
          end: plan.start + plan.passage.length,
        },
      },
      plan.claim,
      `z${index}`,
    ),
    connection: {
      source: { node: plan.claim, transaction: original.id },
      target: { node: plan.source, transaction: original.id },
    },
  }));
  for (const [index, [, group]] of topicSamples.entries()) {
    const topic = `preview:density:topic:${index}`;
    citations.push(
      edge(`preview:density:tag:${index}`, topic, `preview:density:theme:${group}`, 'tag'),
    );
    const peers = topicSamples.flatMap(([, peerGroup], peer) =>
      peerGroup === group && peer !== index ? [peer] : [],
    );
    for (const peer of peers.filter((candidate) => candidate > index))
      citations.push(
        edge(
          `preview:density:related:${index}:${peer}`,
          topic,
          `preview:density:topic:${peer}`,
          'related-to',
        ),
      );
    if (group === 'Studio')
      citations.push(
        edge(`preview:density:studio-related:${index}`, 'preview:graph-topic', topic, 'related-to'),
      );
    for (let questionIndex = 0; questionIndex < 2; questionIndex++) {
      const question = `preview:density:question:${index}:${questionIndex}`;
      citations.push(
        edge(
          `preview:density:question-informed:${index}:${questionIndex}`,
          question,
          `preview:density:claim:${index}:${questionIndex}`,
          'informed-by',
        ),
      );
      citations.push(
        edge(
          `preview:density:question-source:${index}:${questionIndex}`,
          question,
          `preview:density:source:${index}:${questionIndex}`,
          'generated-from',
        ),
      );
    }
  }
  await nodes.commit(request('preview:graph-density-links', citations));
  const view = await nodes.snapshot();
  await nodes.commit(
    request(
      'preview:graph-density-later',
      [0, 3, 6, 8]
        .map((index): NodeChange => {
          const before = view.get(`preview:density:source:${index}:0:words`)!;
          return {
            node: before.key.node,
            expected: before.key.transaction,
            placement: before.placement,
            connection: before.connection,
            data: {
              kind: 'run',
              text: `Later review of ${topicSamples[index][0].toLowerCase()}: the first recommendation is still being tried; the second needs revisiting after the season changed.`,
            },
          };
        })
        .concat(
          [2, 5].map((index): NodeChange => {
            const before = view.get(`preview:density:source:${index}:1`)!;
            return {
              node: before.key.node,
              expected: before.key.transaction,
              placement: before.placement,
              connection: before.connection,
              data: null,
            };
          }),
        ),
    ),
  );
}

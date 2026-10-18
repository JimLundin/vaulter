// Comparison-only native sample Vault with shared retained evidence and open questions.
import type { Database } from '@/application/store/index.ts';
import type { applicationSchema } from '@/application/composition.ts';
import { wikiActions } from '@/wiki/operations.ts';
import { topicActions } from '@/graph/topics.ts';
import { questionActions } from '@/questions/operations.ts';

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

export async function seedGraphDensity(db: Database<typeof applicationSchema>) {
  if (
    await db.entities.wikiPages.first({
      where: { key: { eq: 'preview:density:topic:0' } },
      select: {},
    })
  )
    return;
  const author = (await db.entities.actors.first({
    where: { name: { eq: 'Fictional owner' } },
    select: {},
  }))!;
  const wiki = wikiActions(db, author);
  const topics = topicActions(db, { author });
  const agent = await db.transaction((tx) =>
    tx.entities.actors.insert({ name: 'Fictional comparison Agent', kind: 'agent' }),
  );
  const questionWriter = questionActions(db, { author: agent });
  const shared = new Map<
    string,
    import('@/application/store/index.ts').EntityRef<
      typeof import('@/sources/records.ts').SourceDocument
    >
  >();
  for (const group of [...new Set(topicSamples.map(([, category]) => category))]) {
    const text = topicSamples
      .filter(([, entry]) => entry === group)
      .map(([title, , claims]) => `${title}: ${claims[0]} ${claims[1]}`)
      .join('\n');
    shared.set(
      group,
      await db.transaction({ author }, (tx) =>
        tx.entities.sourceDocuments.insert({
          key: `preview:density:shared:${group}`,
          title: `${group} planning conversation`,
          text,
          origin: `https://example.invalid/density/${group}`,
          attribution: 'Fictional owner',
          capturedAt: new Date(),
          available: true,
        }),
      ),
    );
  }
  const specimens = [
    ...topicSamples.map(([title, group, claims, questions], index) => ({
      key: `preview:density:topic:${index}`,
      title,
      group,
      claims: [...claims],
      questions: [...questions],
    })),
    {
      key: 'preview:graph-topic',
      title: 'Studio routine',
      group: 'Studio',
      claims: busyClaims,
      questions: [
        'Which changes to the studio routine are worth trying first?',
        'Can the room support two people working without sharing the same bench?',
      ],
    },
  ];
  for (const [index, specimen] of specimens.entries()) {
    const page =
      specimen.key === 'preview:graph-topic'
        ? (await db.entities.wikiPages.first({ where: { key: { eq: specimen.key } }, select: {} }))!
        : await wiki.createPage({
            key: specimen.key,
            title: specimen.title,
            summary: `Notes, practical decisions and unresolved proposals about ${specimen.title.toLowerCase()}.`,
          });
    const sourceText = specimen.claims
      .slice(0, specimen.key === 'preview:graph-topic' ? 13 : 6)
      .join('\n');
    const source = await db.transaction({ author }, (tx) =>
      tx.entities.sourceDocuments.insert({
        key: `preview:density:source:${index}`,
        title: `${specimen.title} — first observations`,
        text: sourceText,
        origin: `https://example.invalid/density/${index}`,
        attribution: 'Fictional owner',
        capturedAt: new Date(),
        available: true,
      }),
    );
    const paragraphs = await db.transaction({ author }, async (tx) => {
      const content: import('@/application/store/index.ts').EntityRef<
        typeof import('@/wiki/records.ts').Content
      >[] = [];
      for (const [claimIndex, text] of specimen.claims.entries()) {
        const key = `preview:density:claim:${index}:${claimIndex}`;
        const paragraph = await tx.entities.wikiContent.insert({
          key,
          kind: 'paragraph',
          available: true,
        });
        content.push(paragraph);
        await tx.entities.wikiAppearances.insert({
          key: `${key}:appearance`,
          content: paragraph,
          page,
          order: `d${String(claimIndex).padStart(2, '0')}`,
          available: true,
        });
        const words = await tx.entities.wikiContent.insert({
          key: `${key}:words`,
          kind: 'text',
          text,
          marks: [],
          available: true,
        });
        await tx.entities.wikiAppearances.insert({
          key: `${key}:words:appearance`,
          content: words,
          parent: paragraph,
          order: 'a',
          available: true,
        });
      }
      return content;
    });
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const subject = await db.history.reference(snapshot, page);
    const address = await db.history.reference(snapshot, source);
    if (specimen.key !== 'preview:graph-topic')
      await topics.promote({
        key: specimen.key,
        subject,
        title: specimen.title,
        rationale: 'A recurring area of inquiry.',
      });
    await wiki.referencePage(`preview:density:reference:${index}`, page, address);
    const sharedAddress = await db.history.reference(snapshot, shared.get(specimen.group)!);
    await wiki.referencePage(`preview:density:shared-reference:${index}`, page, sharedAddress);
    await topics.addMember(
      specimen.key,
      sharedAddress,
      false,
      'Shared planning material informs this topic.',
    );
    const assertions = await Promise.all(
      paragraphs.map((paragraph) => db.history.reference(snapshot, paragraph)),
    );
    await db.transaction({ author }, async (tx) => {
      for (const [claimIndex, text] of specimen.claims.entries()) {
        const start = sourceText.indexOf(text);
        if (start < 0) continue;
        const assertion = await tx.entities.textSelectors.insert({
          target: assertions[claimIndex]!,
          format: 'wiki-text-utf16-v1',
          start: 0,
          end: text.length,
        });
        const passage = await tx.entities.textSelectors.insert({
          target: address,
          format: 'source-text-utf16-v1',
          start,
          end: start + text.length,
        });
        const review = await tx.entities.reviews.insert({
          key: `preview:density:review:${index}:${claimIndex}`,
          assertion,
          reviewer: author,
          reviewedAt: new Date(),
          result: 'supported',
          rationale: 'The retained observation supports this statement.',
        });
        await tx.entities.reviewPassages.insert({ review, passage });
      }
    });
    for (const [questionIndex, text] of specimen.questions.entries())
      await questionWriter.ask({
        key: `preview:density:question:${index}:${questionIndex}`,
        text,
        source: address,
        subject,
        knowledge: [],
        suggestions: [
          {
            title: 'Try a small change',
            text: 'Try one reversible change and review the result.',
            reason: 'The retained planning source leaves this decision open.',
          },
        ],
      });
    if ([0, 3, 6, 8].includes(index))
      await db.transaction({ author }, (tx) =>
        tx.entities.sourceDocuments.update({
          ...source,
          text: `Later review of ${specimen.title.toLowerCase()}: the first recommendation is still being tried; the second needs revisiting after the season changed.`,
        }),
      );
    if ([2, 5].includes(index))
      await db.transaction({ author }, (tx) => tx.entities.sourceDocuments.delete(source));
  }
}

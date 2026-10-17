import type { QuestionDatabase } from '@/workflows/questions/data/schema.ts';
import { questionActions } from '@/workflows/questions/data/operations.ts';
import type { applicationSchema } from '@/application/composition.ts';
import type { Database } from '@/vault/eav/index.ts';

export async function seedEavQuestions(db: Database<typeof applicationSchema> & QuestionDatabase) {
  if (await db.entities.questions.first({ where: { key: { eq: 'preview:question' } }, select: {} }))
    return;
  const { agent, source } = await db.transaction(async (tx) => ({
    agent: await tx.entities.actors.insert({ name: 'Fictional Agent', kind: 'agent' }),
    source: await tx.entities.sourceDocuments.insert({
      key: 'preview:question-source',
      title: 'Studio tools notes',
      text: 'I use chisels and a hand plane most mornings. The power tools are for occasional projects, and there is not room to leave everything out.',
      origin: '',
      attribution: 'Fictional owner',
      capturedAt: new Date(),
      available: true,
    }),
  }));
  const page = (await db.entities.wikiPages.first({
    where: { key: { eq: 'preview:page:0' } },
    select: {},
  }))!;
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  await questionActions(db, { author: agent }).ask({
    key: 'preview:question',
    text: 'Which tools should stay?',
    source: await db.history.reference(snapshot, source),
    subject: await db.history.reference(snapshot, page),
    knowledge: [],
    suggestions: [
      {
        title: 'Keep hand tools close',
        text: 'Keep chisels and a hand plane within reach; put occasional tools away.',
        reason: 'The source describes daily hand-tool use and limited room.',
      },
      {
        title: 'Store everything between sessions',
        text: 'Store every tool after each session, with the chisels and hand plane together in an easy-to-reach drawer.',
        reason: 'The source describes limited room for leaving tools out.',
      },
    ],
  });
}

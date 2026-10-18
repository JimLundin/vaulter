import { sameEntity, type HistoricalReference } from '@/core/store/index.ts';
import type { Question, QuestionTarget } from '@/modules/questions/reading.ts';
import { answerSuggestions } from '@/modules/questions/suggestions.ts';
import type { QuestionDatabase } from './records.ts';

/** Historical addresses retain source text after edits/removal without borrowing another owner. */
export async function readTarget(
  db: QuestionDatabase,
  address: HistoricalReference,
): Promise<QuestionTarget> {
  const resolved = await db.history.resolve(address);
  const recorded = await db.history.inspect(resolved.transaction, resolved.entity);
  const latest = await db.history.transactions.first({
    select: { sequence: true },
    orderBy: [{ sequence: 'desc' }],
  });
  const current = latest && (await db.history.inspect(latest, resolved.entity));
  const values = recorded?.values ?? {};
  return {
    evidence: address,
    state:
      !current || current.values.available === false
        ? 'deleted'
        : JSON.stringify(values) === JSON.stringify(current.values)
          ? 'available'
          : 'newer',
    text: typeof values.text === 'string' ? values.text : undefined,
    label: typeof values.title === 'string' ? values.title : undefined,
    href:
      address.type === 'wiki.page' && typeof values.key === 'string'
        ? `#/wiki/${encodeURIComponent(values.key)}/`
        : undefined,
  };
}

export async function readEavQuestions(db: QuestionDatabase): Promise<Question[]> {
  const snapshot = await db.history.transactions.first({
    select: { sequence: true },
    orderBy: [{ sequence: 'desc' }],
  });
  if (!snapshot) return [];
  const view = db.at(snapshot);
  const [questions, contexts, answers] = await Promise.all([
    view.entities.questions.query({
      limit: null, // Question assembly needs complete contexts and Answers.
      select: {
        key: true,
        text: true,
        status: true,
        suggestions: true,
        available: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    }),
    view.entities.questionContexts.query({
      limit: null, // Question assembly needs complete contexts and Answers.
      select: { question: true, role: true, target: true, order: true },
      orderBy: [{ order: 'asc' }],
    }),
    view.entities.questionAnswers.query({
      limit: null, // Question assembly needs complete contexts and Answers.
      select: { key: true, question: true, text: true, available: true, recordedAt: true },
      orderBy: [{ recordedAt: 'asc' }],
    }),
  ]);
  return Promise.all(
    questions
      .filter((question) => question.available)
      .map(async (question) => {
        const latest = (await db.history.entities.questions.first({
          where: {
            entity: { eq: question },
            sequence: {
              lt: snapshot.sequence + 1,
            },
          },
          select: { transaction: { committedAt: true, author: true, origin: true } },
          orderBy: [{ sequence: 'desc' }],
        }))!;
        const evidence = await db.history.reference(latest.transaction, question);
        const first = (await db.history.entities.questions.first({
          where: { entity: { eq: question } },
          select: { transaction: { committedAt: true, author: true, origin: true } },
          orderBy: [{ sequence: 'asc' }],
        }))!;
        const attribution = async (transaction: typeof latest.transaction) => ({
          transaction: (await db.history.reference(transaction, question)).transaction,
          at: transaction.committedAt.toISOString(),
          author: transaction.author
            ? await db.history.reference(transaction, transaction.author)
            : undefined,
          origin: transaction.origin
            ? await db.history.reference(transaction, transaction.origin)
            : undefined,
        });
        const related = await Promise.all(
          contexts
            .filter((entry) => sameEntity(entry.question, question))
            .map(async (entry) => ({
              role: entry.role,
              target: await readTarget(db, entry.target),
            })),
        );
        const response = await Promise.all(
          answers
            .filter((entry) => sameEntity(entry.question, question))
            .map(async (answer) => {
              const first = (await db.history.entities.questionAnswers.first({
                where: { entity: { eq: answer } },
                select: { transaction: {} },
                orderBy: [{ sequence: 'asc' }],
              }))!;
              const target = await readTarget(
                db,
                await db.history.reference(first.transaction, answer),
              );
              return target;
            }),
        );
        const subjects = related
          .filter((entry) => entry.role === 'subject')
          .map((entry) => entry.target);
        return {
          id: question.key,
          evidence,
          created: await attribution(first.transaction),
          updated: await attribution(latest.transaction),
          data: {
            kind: 'question' as const,
            text: question.text,
            ...(question.suggestions !== undefined && {
              suggestions: answerSuggestions.parse(question.suggestions),
            }),
          },
          status: response.length ? ('answered' as const) : question.status,
          subjects,
          answers: response,
          sources: related.filter((entry) => entry.role === 'source').map((entry) => entry.target),
          reviews: related.filter((entry) => entry.role === 'review').map((entry) => entry.target),
          knowledge: related
            .filter((entry) => entry.role === 'knowledge')
            .map((entry) => entry.target),
        };
      }),
  );
}

import { expect, test } from 'vitest';
import { createMemoryStorage, sameEntity } from '@/vault/eav/index.ts';
import { createEvent, readCalendar } from '@/calendar/index.ts';
import { applicationCalendar, applicationWiki, applicationSubjectCalendar } from './composition.ts';
import { wikiActions } from '@/workflows/wiki/data/operations.ts';

test('Wiki subject timelines use identity rather than matching names and user actions keep attribution', async () => {
  const storage = createMemoryStorage();
  const calendar = applicationCalendar(storage, {
    user: 'configured-user',
    agent: 'configured-agent',
  });
  const db = await calendar.database();
  try {
    const actor = await db.transaction((tx) =>
      tx.entities.actors.insert({ name: 'Other person', kind: 'user' }),
    );
    const wiki = wikiActions(db, actor);
    const page = await wiki.createPage({ key: 'studio', title: 'Studio', summary: '' });
    await wiki.createPage({ key: 'different-studio', title: 'Studio', summary: '' });
    const snapshot = (await db.history.transactions.first({
      select: {},
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const subject = await db.history.reference(snapshot, page);
    await calendar.actions.create({
      title: 'Visit',
      description: '',
      status: 'planned',
      time: { kind: 'unknown' },
      roles: [{ subject, kind: 'place', role: 'venue', order: 0 }],
    });
    const data = await readCalendar(db);
    expect((await applicationSubjectCalendar(storage, 'studio', data)).events).toHaveLength(1);
    expect((await applicationSubjectCalendar(storage, 'different-studio', data)).events).toEqual(
      [],
    );
    const latest = (await db.history.transactions.first({
      select: { author: true },
      orderBy: [{ sequence: 'desc' }],
    }))!;
    const binding = (await db.entities.actorBindings.first({
      where: { key: { eq: 'configured-user' } },
      select: { actor: true },
    }))!;
    expect(sameEntity(latest.author!, binding.actor)).toBe(true);
    expect(sameEntity(latest.author!, actor)).toBe(false);
  } finally {
    await db[Symbol.asyncDispose]();
  }
});

test('Calendar uses the shared Vault identity and retains transaction attribution', async () => {
  const storage = createMemoryStorage();
  const db = await applicationCalendar(storage).database();
  try {
    expect(await applicationWiki(storage).database()).toBe(db);
    const actor = await db.transaction((tx) =>
      tx.entities.actors.insert({ name: 'Jim', kind: 'user' }),
    );
    await createEvent(
      db,
      {
        title: 'Appointment',
        description: 'Awaiting confirmation',
        status: 'planned',
        time: { kind: 'unknown', expression: 'next month' },
      },
      { author: actor },
    );
    const latest = (await db.history.transactions.first({
      select: { author: true },
      orderBy: [{ sequence: 'desc' }],
    }))!;
    expect(sameEntity(latest.author!, actor)).toBe(true);
    expect((await readCalendar(db)).events[0]).toMatchObject({
      title: 'Appointment',
      status: 'planned',
      time: { kind: 'unknown', expression: 'next month' },
    });
  } finally {
    await db[Symbol.asyncDispose]();
  }
});

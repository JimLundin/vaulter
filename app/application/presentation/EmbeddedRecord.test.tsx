// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { createMemoryStorage } from '@/core/store/index.ts';
import { applicationDatabase } from '@/application/composition/database.ts';
import { EmbeddedRecord } from './EmbeddedRecord.tsx';

test('mounted live embeds refresh while pinned embeds remain unchanged through effect replay', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const database = applicationDatabase(createMemoryStorage());
  await using db = await database;
  const question = await db.transaction((tx) =>
    tx.entities.questions.insert({
      key: 'embedded',
      text: 'Original question?',
      status: 'open',
      available: true,
      createdAt: new Date(),
    }),
  );
  const snapshot = (await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  }))!;
  const target = await db.history.reference(snapshot, question);
  const root = createRoot(document.body);
  const before = await db.history.transactions.query({ limit: null, select: {} });
  try {
    await act(async () => {
      root.render(
        <StrictMode>
          <EmbeddedRecord database={database} embed={{ mode: 'live', target }} />
          <EmbeddedRecord database={database} embed={{ mode: 'pinned', target }} />
        </StrictMode>,
      );
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(document.body.textContent?.match(/Original question\?/g)).toHaveLength(2);
    expect(await db.history.transactions.query({ limit: null, select: {} })).toHaveLength(
      before.length,
    );
    await act(async () => {
      await db.transaction(async (tx) => {
        const current = (await tx.entities.questions.get(question, { select: {} }))!;
        await tx.entities.questions.update({ ...current, text: 'Changed question?' });
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(document.body.textContent).toContain('Changed question?');
    expect(document.body.textContent?.match(/Original question\?/g)).toHaveLength(1);
  } finally {
    await act(() => root.unmount());
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  }
});

import { applicationDatabase } from '@/application/composition.ts';
import { createCoordinates } from '@/map/index.ts';
import type { JournalStorage } from '@/application/store/index.ts';

/** Sample positions are fictional annotations on the existing sample pages. */
export async function seedMap(storage: JournalStorage) {
  const db = await applicationDatabase(storage);
  if (await db.entities.mapCoordinates.first({ select: {} })) return;
  const pages = await db.entities.wikiPages.query({ select: { title: true }, limit: 3 });
  const snapshot = await db.history.transactions.first({
    select: {},
    orderBy: [{ sequence: 'desc' }],
  });
  if (!snapshot) return;
  const positions = [
    [59.3293, 18.0686],
    [59.338, 18.035],
    [59.317, 18.092],
  ];
  for (const [index, page] of pages.entries()) {
    const position = positions[index]!;
    // biome-ignore lint/performance/noAwaitInLoops: Each annotation is a separate accepted transaction.
    await createCoordinates(db, {
      subject: await db.history.reference(snapshot, page),
      coordinates: {
        kind: 'geographic',
        crs: 'EPSG:4326',
        latitude: position[0]!,
        longitude: position[1]!,
      },
    });
  }
}

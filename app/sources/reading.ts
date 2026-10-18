import type { EntityRef, DomainDatabase, HistoricalReference } from '@/application/store/index.ts';
import { sourceEntities, type SourceDocument } from './records.ts';
type SourceDatabase = DomainDatabase<typeof sourceEntities>;
export interface SourceProjection {
  readonly title: string;
  readonly text: string;
  readonly attribution?: string;
  readonly date?: string;
  readonly href?: string;
  readonly available: boolean;
}
/** Application supplies native source owners. Wiki content can never supply source evidence. */
export type SourceReading = (
  address: HistoricalReference,
) => Promise<{ recorded: SourceProjection; current?: SourceProjection }>;
export function documentSources(db: SourceDatabase): SourceReading {
  return async (address) => {
    const resolved = await db.history.resolve(address);
    if (address.type !== 'source.document')
      throw new Error('The selected record is not an eligible source document');
    const past = db.at(resolved.transaction);
    const original = await past.entities.sourceDocuments.get(
      resolved.entity as EntityRef<typeof SourceDocument>,
      {
        select: {
          key: true,
          title: true,
          text: true,
          attribution: true,
          origin: true,
          occurredAt: true,
          available: true,
        },
      },
    );
    if (!original?.available)
      throw new Error('Source material is unavailable in its selected snapshot');
    const current = await db.entities.sourceDocuments.get(original, {
      select: {
        title: true,
        text: true,
        attribution: true,
        origin: true,
        occurredAt: true,
        available: true,
      },
    });
    const describe = (value: NonNullable<typeof current>): SourceProjection => ({
      title: value.title,
      text: value.text,
      attribution: value.attribution,
      href: value.origin || undefined,
      date: value.occurredAt,
      available: value.available,
    });
    return { recorded: describe(original), current: current && describe(current) };
  };
}

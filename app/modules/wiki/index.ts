// biome-ignore-all lint/performance/noBarrelFile: This domain exposes its behavior through one owner entry.
export {
  wikiEntities,
  wikiSchema,
  WikiPage as WikiPageRecord,
  Content,
  Appearance,
  PageReference,
} from './records.ts';
export type { PageRef, ContentRef } from './records.ts';
export { wikiActions } from './operations.ts';
export { readEavWiki } from './pages.ts';
export { createEavWikiReading, useEavWikiReading } from './reading.ts';
export { wikiTools, wikiCapabilities } from './tools.ts';
export type { SourceReading, WikiDatabase } from './reviews/selection.ts';
export type { WikiPage, WikiBlock, WikiReference } from './view.ts';
export { wikiRoute, pageRoute } from './routes.ts';
export { evidenceEntities } from './reviews/records.ts';

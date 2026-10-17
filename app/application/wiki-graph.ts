import { e, type DomainDatabase } from '@/vault/eav/index.ts';
import { wikiSchema } from '@/workflows/wiki/data/schema.ts';
import { readEavWiki } from '@/workflows/wiki/data/pages.ts';
import type { WikiBlock, WikiPage } from '@/workflows/wiki/view.ts';
import { topicEntities } from '@/workflows/graph/data/schema.ts';
import { readTopics, topicMembers } from '@/workflows/graph/data/topics.ts';
import type { GraphMapBlock, GraphMapTopic } from '@/workflows/graph/map.ts';

const schema = e.registry({ ...wikiSchema, ...topicEntities });
type WikiGraphDatabase = DomainDatabase<typeof schema>;

/** Application joins owner projections; Graph never decodes Wiki records or duplicates content. */
export async function readWikiGraphTopics(db: WikiGraphDatabase): Promise<GraphMapTopic[]> {
  const [pages, topics] = await Promise.all([readEavWiki(db), readTopics(db)]);
  const block = (value: WikiBlock): GraphMapBlock => ({
    id: value.address?.entity ?? value.id,
    data: value.data,
    children: value.children.map(block),
    evidence: value.evidence.flatMap((reference) =>
      reference.address
        ? [
            {
              id: reference.id,
              title: reference.title,
              text: reference.text,
              currentText: reference.currentText,
              href: reference.href,
              state: reference.state,
              address: reference.address,
            },
          ]
        : [],
    ),
  });
  return Promise.all(
    topics.map(async (topic) => {
      const addresses = [
        topic.subject,
        ...(await topicMembers(db, topic.id)).members.map((member) => member.member),
      ];
      const selected: WikiPage[] = [];
      let subjectKey: string | undefined;
      const selectedRecords = await Promise.all(
        addresses
          .filter((address) => address.type === 'wiki.page')
          .map(async (address) => {
            const resolved = await db.history.resolve(address);
            const recorded = await db.history.inspect(resolved.transaction, resolved.entity);
            return { address, key: recorded?.values.key };
          }),
      );
      for (const { address, key } of selectedRecords) {
        if (address === topic.subject && typeof key === 'string') subjectKey = key;
        const page = pages.find((candidate) => candidate.id === key);
        if (page && !selected.includes(page)) selected.push(page);
      }
      return {
        id: topic.subject.entity,
        title: topic.title,
        href: subjectKey ? `#/wiki/${encodeURIComponent(subjectKey)}/` : undefined,
        available: !!selected.find((page) => page.id === subjectKey),
        blocks: selected.flatMap((page) => page.blocks.map(block)),
        metadata: selected.flatMap((page) => page.metadata),
      };
    }),
  );
}

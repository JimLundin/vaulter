// Topics: one page per tag, area and circle (#/topic/<tag>/), and the topics in search.
import type { Extension } from '../../core/extension.ts';
import { topicHref } from '../notes/model/fields.ts';
import { slugify } from '../notes/model/paths.ts';
import { Topic } from './Topic.tsx';
import { pattern } from '../../core/route.ts';
import { graphOf } from '../graph/model/graph.ts';

// A topic's href is the vault model's (topicHref); this is how its page is found again
const topicPage = pattern('/topic/:slug/');

export const topics: Extension = {
  id: 'topics',
  page(path, host) {
    const vault = graphOf(host.files);
    const at = topicPage.match(path);
    const name = at && [...vault.topics.keys()].find((t) => slugify(t) === at.slug);
    return name ? { title: name.replace(/-/g, ' '), body: <Topic key={name} name={name} /> } : null;
  },
  search: ({ files }) =>
    [...graphOf(files).topics].map(([name, list]) => ({
      href: topicHref(name),
      t: name,
      e: `${list.length} ${list.length === 1 ? 'note' : 'notes'}`,
      a: [],
      k: 'topic',
      g: [],
      n: list.length,
    })),
};

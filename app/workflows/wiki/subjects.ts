import { liveAncestry } from '../../vault/nodes/reading.ts';
import type { NodeVersion } from '../../vault/nodes/model.ts';
import type { NodeSnapshot } from '../../vault/nodes/store.ts';

/** Wiki owns which live records can be addressed as subjects and how they are named. */
export function readWikiSubject(view: NodeSnapshot, node: string) {
  const subject = view.get(node);
  if (!(subject?.data && ['page', 'section'].includes(String(subject.data.kind)))) return;
  const ancestry = liveAncestry(view, node);
  const page = ancestry?.find((version) => version.data?.kind === 'page');
  if (!page) return;
  return {
    node,
    title: String(page.data?.title ?? 'Wiki page'),
    kind: String(subject.data.kind),
  };
}

/** Discover without tracking unrelated records; validate the selected ancestry through live reads. */
export function listWikiSubjects(discovery: NodeSnapshot, selected = discovery) {
  const subjects: NonNullable<ReturnType<typeof readWikiSubject>>[] = [];
  const seen = new Set<string>();
  const visit = (node: NodeVersion) => {
    if (!node.data || seen.has(node.key.node)) return;
    seen.add(node.key.node);
    if (node.data.kind === 'page' || node.data.kind === 'section') {
      const subject = readWikiSubject(selected, node.key.node);
      if (subject) subjects.push(subject);
    }
    for (const child of discovery.children(node.key.node)) visit(child);
  };
  for (const root of discovery.roots()) visit(root);
  return subjects;
}

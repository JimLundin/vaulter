// Prepare bounded evidence-review packets and compile agent selections into validated citations.
import { z } from 'zod';
import { snapshotOf } from '../../app/vault/nodes/history.ts';
import type { NodeVersion } from '../../app/vault/nodes/model.ts';
import type { NodeRecord } from '../../app/vault/nodes/validation.ts';
import { recordText } from '../../app/workflows/wiki/text.ts';
import { isWikiContent, selectText } from '../../app/workflows/wiki/citations.ts';
import { canonical } from '../../app/vault/nodes/json.ts';
import type { EvidenceReview } from './enrichment.ts';
import { pageReferenceLinks, wikiClaims } from '../../app/workflows/wiki/references.ts';
import { validateEvidence } from '../../app/workflows/wiki/evidence.ts';
import { migrationSources, selectedCitations } from './wiki.ts';

export interface ReviewPassage {
  address: { node: string; transaction: string };
  sequence: number;
  title: string;
  kind: 'page' | 'message' | 'capture';
  role?: string;
  text: string;
  start: number;
  association: string;
}
export interface ReviewPacket {
  page: string;
  title: string;
  sequence: number;
  blocks: {
    address: { node: string; transaction: string };
    text: string;
    candidates: ReviewPassage[];
  }[];
  unavailableSources: number;
  blocksWithoutCandidates: number;
}
const wordsOf = (text: string) =>
  new Set(text.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
const ignored = new Set(
  'the and that this with from have has was are not for but you your they their our can will would should into also what when where more some than then about only these there which each been were them use using all how does could'.split(
    ' ',
  ),
);
const termsOf = (text: string) => new Set([...wordsOf(text)].filter((word) => !ignored.has(word)));

/** Retrieval only: lexical overlap ranks passages for an agent; it never establishes support. */
export function prepareReviews(records: readonly NodeRecord[]): ReviewPacket[] {
  const view = snapshotOf(records);
  const transactions = new Map(
    records.map((record) => [record.transaction.id, record.transaction.sequence]),
  );
  const historical = new Map<number, ReturnType<typeof snapshotOf>>();
  const at = (sequence: number) => {
    let snapshot = historical.get(sequence);
    if (!snapshot) {
      snapshot = snapshotOf(records, sequence);
      historical.set(sequence, snapshot);
    }
    return snapshot;
  };
  const all: NodeVersion[] = [];
  const visit = (node: NodeVersion) => {
    all.push(node);
    for (const child of view.children(node.key.node)) visit(child);
  };
  for (const root of view.roots()) visit(root);
  const pageOf = (node: NodeVersion) => {
    let current = node;
    while (current.placement && current.data?.kind !== 'page') {
      const parent = view.get(current.placement.parent);
      if (!parent?.data) break;
      current = parent;
    }
    return current.data?.kind === 'page' ? current : undefined;
  };
  const descendants = (node: NodeVersion, snapshot = view): NodeVersion[] => [
    node,
    ...snapshot.children(node.key.node).flatMap((child) => descendants(child, snapshot)),
  ];
  const pages = all.filter((node) => node.data?.kind === 'page');
  const packets: ReviewPacket[] = [];
  for (const page of pages) {
    const nodes = descendants(page);
    const sourceLinks = pageReferenceLinks(page, view, migrationSources);
    const claims = wikiClaims(page, view, migrationSources).filter(
      ({ text }) => termsOf(text).size >= 4 && text.length >= 35,
    );
    const pool: ReviewPassage[] = [];
    const collected = new Set<string>();
    let unavailableSources = 0;
    const collectSource = (target: NodeVersion, sequence: number, association: string) => {
      const key = `${target.key.node}@${target.key.transaction}:${sequence}`;
      if (collected.has(key)) return;
      collected.add(key);
      if (target.key.node === page.key.node) return;
      const snapshot = at(sequence);
      const description = migrationSources.describe(target, snapshot);
      const title = description?.title || 'Capture';
      if (isWikiContent(target, snapshot)) return;
      let rootText: string;
      try {
        rootText = recordText(target, snapshot, migrationSources);
      } catch {
        unavailableSources++;
        return;
      }
      if (!rootText) {
        unavailableSources++;
        return;
      }
      const contents = descendants(target, snapshot);
      const sources = contents.filter(
        (node) =>
          ['paragraph', 'message'].includes(String(node.data?.kind)) ||
          (node === target && ['item', 'run'].includes(String(node.data?.kind))),
      );
      // Source owners may keep prose directly on the root rather than in Wiki text descendants.
      if (!sources.length) sources.push(target);
      for (const source of sources) {
        if (isWikiContent(source, snapshot)) continue;
        const context = recordText(source, snapshot, migrationSources);
        const sourceDescription = migrationSources.describe(source, snapshot);
        // Messages are chunked for retrieval; all offsets remain in the complete message projection.
        const parts =
          source.data?.kind === 'message'
            ? [...context.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)]
            : [Object.assign([context], { index: 0 })];
        for (const part of parts) {
          const [text] = part;
          if (text.length < 35 || termsOf(text).size < 4) continue;
          // Keep complete bounded contexts; oversized paragraphs stay reviewable through other passages.
          if (text.length > 6000) continue;
          pool.push({
            address: source.key,
            sequence,
            title,
            kind:
              source.data?.kind === 'message'
                ? 'message'
                : source === target &&
                    !['paragraph', 'item', 'run'].includes(String(source.data?.kind))
                  ? 'capture'
                  : 'page',
            ...(sourceDescription?.speaker ? { role: sourceDescription.speaker } : {}),
            text,
            start: part.index ?? 0,
            association,
          });
        }
      }
    };
    const references = nodes.filter(
      (node) => node.connection && ['link', 'relationship'].includes(String(node.data?.kind)),
    );
    for (const link of references) {
      const target = view.resolve(link.connection!.target);
      if (!target?.data) continue;
      const isExplicit = sourceLinks.includes(link);
      if (
        !(
          isExplicit ||
          ['page', 'section', 'exchange', 'message', 'conversation'].includes(
            String(target.data.kind),
          )
        )
      )
        continue;
      const sequence = link.connection!.target.transaction
        ? transactions.get(target.key.transaction)!
        : view.sequence;
      const association = isExplicit
        ? 'explicit page source'
        : 'linked page; support still requires review';
      collectSource(target, sequence, association);
      // Follow linked source pages to their capture references, allowing primary evidence tracing.
      if (['page', 'section'].includes(String(target.data.kind))) {
        const parent = pageOf(target);
        if (parent && parent.key.node !== page.key.node) {
          for (const ref of pageReferenceLinks(parent, view, migrationSources)) {
            const source = ref.connection && view.resolve(ref.connection.target);
            if (
              source?.data &&
              ['exchange', 'message', 'conversation'].includes(String(source.data.kind))
            ) {
              const cutoff = ref.connection!.target.transaction
                ? transactions.get(source.key.transaction)!
                : view.sequence;
              collectSource(
                source,
                cutoff,
                'capture referenced by a linked page; verify subject and entailment',
              );
            }
          }
        }
      }
    }
    const blocks = claims.map(({ node, text }) => {
      const terms = termsOf(text);
      const ranked = pool
        .map((candidate) => {
          const sourceTerms = termsOf(candidate.text);
          const shared = [...terms].filter((term) => sourceTerms.has(term));
          const score = shared.length / Math.sqrt(terms.size * sourceTerms.size);
          return { candidate, shared: shared.length, score };
        })
        .filter(({ shared, score }) => shared >= 4 && score >= 0.18)
        .sort((a, b) => b.score - a.score);
      // Distinct sources can independently support the same claim. Scores never enter persisted data.
      const candidates = ranked.slice(0, 4).map(({ candidate }) => candidate);
      return { address: node.key, text, candidates };
    });
    packets.push({
      page: page.key.node,
      title: String(page.data?.title),
      sequence: view.sequence,
      blocks,
      unavailableSources,
      blocksWithoutCandidates: blocks.filter((block) => !block.candidates.length).length,
    });
  }
  return packets.sort((a, b) => a.title.localeCompare(b.title));
}

const decision = z.strictObject({
  claim: z.string().min(1),
  claimQuote: z.string().min(1),
  candidate: z.number().int().nonnegative(),
  passageQuote: z.string().min(1),
  rationale: z.string().trim().min(1),
});
export const agentReview = z.strictObject({
  page: z.string().min(1),
  citations: z.array(decision),
  rejected: z.string().min(1),
});
export type AgentReview = z.infer<typeof agentReview>;

/** The agent selects verbatim text; deterministic code resolves offsets and validates history.
 * Ambiguous quotations, unknown candidates, self citations and stale claims fail closed. */
export function compileReviews(
  records: readonly NodeRecord[],
  packets: readonly ReviewPacket[],
  decisions: readonly AgentReview[],
  reviewer: string,
): EvidenceReview {
  const view = snapshotOf(records);
  const seen = new Set<string>();
  const citations: EvidenceReview['citations'] = [];
  const snapshots = new Map<number, ReturnType<typeof snapshotOf>>();
  const locate = (context: string, quote: string) => {
    const start = context.indexOf(quote);
    if (start < 0 || context.indexOf(quote, start + 1) >= 0)
      throw new Error('Review quotation is missing or ambiguous');
    return { start, end: start + quote.length };
  };
  for (const input of decisions) {
    const review = agentReview.parse(input);
    if (seen.has(review.page)) throw new Error('Duplicate page review');
    seen.add(review.page);
    const packet = packets.find((entry) => entry.page === review.page);
    if (!packet || packet.sequence !== view.sequence)
      throw new Error('Review packet is missing or stale');
    for (const selection of review.citations) {
      const block = packet.blocks.find((entry) => entry.address.node === selection.claim);
      const candidate = block?.candidates[selection.candidate];
      if (!(block && candidate) || candidate.address.node === block.address.node)
        throw new Error('Unknown or self-citing evidence candidate');
      const claimRange = locate(block.text, selection.claimQuote);
      const sourceRange = locate(candidate.text, selection.passageQuote);
      const claim = {
        address: block.address,
        selection: { sequence: packet.sequence, ...claimRange },
        quote: selection.claimQuote,
      };
      const passage = {
        address: candidate.address,
        selection: {
          sequence: candidate.sequence,
          start: candidate.start + sourceRange.start,
          end: candidate.start + sourceRange.end,
        },
        quote: selection.passageQuote,
      };
      if (selectText(claim.address, claim.selection, view, migrationSources).text !== claim.quote)
        throw new Error('Claim packet differs from historical projection');
      let historical = snapshots.get(candidate.sequence);
      if (!historical) {
        historical = snapshotOf(records, candidate.sequence);
        snapshots.set(candidate.sequence, historical);
      }
      const selected = selectText(passage.address, passage.selection, historical, migrationSources);
      if (selected.text !== passage.quote)
        throw new Error('Source packet differs from historical projection');
      citations.push({ claim, passage, rationale: selection.rationale });
    }
  }
  const unique = citations.filter(
    (entry, index) =>
      citations.findIndex(
        (other) =>
          canonical({ claim: other.claim, passage: other.passage }) ===
          canonical({ claim: entry.claim, passage: entry.passage }),
      ) === index,
  );
  validateEvidence(
    view,
    (sequence) => {
      let historical = snapshots.get(sequence);
      if (!historical) {
        historical = snapshotOf(records, sequence);
        snapshots.set(sequence, historical);
      }
      return historical;
    },
    unique,
    selectedCitations(records, view),
  );
  return { format: 1, reviewer, citations: unique };
}

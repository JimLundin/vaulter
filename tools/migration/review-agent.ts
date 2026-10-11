// Prepare private agent packets or compile completed reviews; no model API or live vault writes.
import { mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { snapshotOf } from '../../app/vault/nodes/history.ts';
import { defaultIdentities } from '../../app/application-identities.ts';
import { prepareReviews, compileReviews, agentReview, type ReviewPacket } from './review.ts';
import { publishedVault } from './published.ts';

const option = (name: string, fallback: string) => {
  const index = process.argv.lastIndexOf(`--${name}`);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing --${name} value`);
  return value;
};
const vault = realpathSync(resolve(option('vault', '../vault')));
const { head, records } = publishedVault(vault, option('vault-ref', 'HEAD'));
const checkDestination = (destination: string) => {
  const difference = relative(vault, destination);
  if (!difference || (!difference.startsWith('../') && difference !== '..'))
    throw new Error('Review output must be outside source vault');
};
const completed = option('compile', '');
if (completed) {
  const directory = realpathSync(resolve(completed));
  checkDestination(directory);
  const metadata = JSON.parse(readFileSync(join(directory, 'source.json'), 'utf8')) as {
    commit: string;
  };
  if (metadata.commit !== head) throw new Error('Review packets belong to another vault commit');
  const packets = JSON.parse(
    readFileSync(join(directory, 'packets.json'), 'utf8'),
  ) as ReviewPacket[];
  const decisions = readdirSync(join(directory, 'decisions'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) =>
      agentReview.parse(JSON.parse(readFileSync(join(directory, 'decisions', file), 'utf8'))),
    );
  const reviewed = new Set(decisions.map((decision) => decision.page));
  if (
    packets.some(
      (packet) =>
        packet.blocks.some((block) => block.candidates.length) && !reviewed.has(packet.page),
    )
  )
    throw new Error('Review incomplete: every page with candidates needs a decision');
  const review = compileReviews(
    records,
    packets,
    decisions,
    option('reviewer', defaultIdentities.agent),
  );
  const filename = join(directory, 'evidence-review.json');
  const supported = new Set(review.citations.map((entry) => entry.claim.address.node));
  const report = {
    sourceCommit: head,
    pages: packets.length,
    pagesReviewed: decisions.length,
    pagesWithCandidates: packets.filter((packet) =>
      packet.blocks.some((block) => block.candidates.length),
    ).length,
    pagesWithAcceptedEvidence: decisions.filter((decision) => decision.citations.length).length,
    candidateBlocks: packets.reduce(
      (count, packet) => count + packet.blocks.filter((block) => block.candidates.length).length,
      0,
    ),
    blocksWithAcceptedEvidence: supported.size,
    citations: review.citations.length,
    queue: packets.flatMap((packet) => {
      const blocks = packet.blocks.filter((block) => !supported.has(block.address.node));
      return blocks.length || packet.unavailableSources
        ? [
            {
              page: packet.page,
              blocks: blocks.map((block) => ({
                address: block.address,
                reason: block.candidates.length
                  ? 'Reviewed candidates do not establish accepted support'
                  : 'No bounded linked-source candidates',
              })),
              unavailableSources: packet.unavailableSources,
            },
          ]
        : [];
    }),
  };
  writeFileSync(join(directory, 'review-report.json'), `${JSON.stringify(report, null, 2)}\n`, {
    flag: 'wx',
  });
  writeFileSync(filename, `${JSON.stringify(review, null, 2)}\n`, { flag: 'wx' });
  console.log(
    JSON.stringify({
      pagesReviewed: decisions.length,
      citations: review.citations.length,
      output: filename,
    }),
  );
} else {
  const out = resolve(option('out', join(tmpdir(), 'wiki-evidence-agent')));
  const destination = join(realpathSync(dirname(out)), out.split('/').at(-1)!);
  checkDestination(destination);
  const packets = prepareReviews(records);
  const index = packets.map((packet) => ({
    page: packet.page,
    title: packet.title,
    file: `${packet.page}.json`,
    blocks: packet.blocks.filter((block) => block.candidates.length).length,
    uncoveredBlocks: packet.blocksWithoutCandidates,
    unavailableSources: packet.unavailableSources,
  }));
  mkdirSync(destination);
  mkdirSync(join(destination, 'decisions'));
  writeFileSync(
    join(destination, 'source.json'),
    `${JSON.stringify({ commit: head, sequence: snapshotOf(records).sequence })}\n`,
  );
  writeFileSync(join(destination, 'packets.json'), `${JSON.stringify(packets)}\n`);
  writeFileSync(join(destination, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  for (const packet of packets)
    writeFileSync(
      join(destination, `${packet.page}.json`),
      `${JSON.stringify({ ...packet, blocks: packet.blocks.filter((block) => block.candidates.length) })}\n`,
    );
  console.log(
    JSON.stringify({
      pages: packets.length,
      pagesWithCandidates: index.filter((entry) => entry.blocks).length,
      candidateBlocks: index.reduce((count, entry) => count + entry.blocks, 0),
      uncoveredBlocks: index.reduce((count, entry) => count + entry.uncoveredBlocks, 0),
      output: destination,
    }),
  );
}

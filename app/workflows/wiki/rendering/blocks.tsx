import type { ReactNode } from 'react';
import type { WikiBlock, WikiReference } from '../pages.ts';
import { isSafeUrl } from '../../../vault/documents/notes/safe-url.ts';
import { Bars, Button, Sparkline, Text } from '../../../ui/kit/index.ts';
import { wikiSchemas } from '../../../vault/records/wiki.ts';

export const blockText = (block: WikiBlock): string =>
  typeof block.data.text === 'string'
    ? block.data.text
    : block.children
        .filter((child) => child.data.kind !== 'cite')
        .map(blockText)
        .join('');

function marked(text: string, marks: unknown): ReactNode {
  let content: ReactNode = text;
  for (const mark of Array.isArray(marks) ? marks : []) {
    if (mark === 'strong') content = <strong>{content}</strong>;
    else if (mark === 'emphasis') content = <em>{content}</em>;
    else if (mark === 'code') content = <code>{content}</code>;
    else if (mark === 'strike') content = <s>{content}</s>;
  }
  return content;
}

/** Group adjacent formatted fragments into one cited statement, using the retained UTF-16 ranges.
 * Ordinary links keep their navigation; no citation button contains another interactive control. */
function InlineContent({
  block,
  onEvidence,
  selected,
}: {
  block: WikiBlock;
  onEvidence: (block: WikiBlock) => void;
  selected?: string;
}) {
  const leaves = typeof block.data.text === 'string' ? [block] : block.children;
  const groups: {
    key: string;
    position: string;
    text: string;
    content: ReactNode[];
    references: WikiReference[];
    owner: WikiBlock;
  }[] = [];
  let offset = 0;
  for (const leaf of leaves) {
    if (!['run', 'link', 'paragraph', 'code'].includes(String(leaf.data.kind))) continue;
    const text = typeof leaf.data.text === 'string' ? leaf.data.text : '';
    const owner = leaf.evidence.length ? leaf : block;
    const references = owner.evidence;
    const base = owner === block ? offset : 0;
    const boundaries = [
      ...new Set([
        0,
        text.length,
        ...references.flatMap(({ claim }) =>
          claim
            ? [
                Math.max(0, Math.min(text.length, claim.start - base)),
                Math.max(0, Math.min(text.length, claim.end - base)),
              ]
            : [],
        ),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 1; i < boundaries.length; i++) {
      const start = boundaries[i - 1]!;
      const end = boundaries[i]!;
      const matching = references.filter(
        ({ claim }) => !claim || (claim.start < base + end && claim.end > base + start),
      );
      const navigates =
        leaf.data.kind === 'link' && !!leaf.href && isSafeUrl(leaf.href) && !leaf.evidence.length;
      const key = navigates
        ? `link:${leaf.id}`
        : `${owner.id}:${matching.map((reference) => reference.id).join(',')}`;
      const fragment = text.slice(start, end);
      const content = navigates ? (
        <a key={`${leaf.id}:${start}`} href={leaf.href}>
          {marked(fragment, leaf.data.marks)}
        </a>
      ) : (
        <span key={`${leaf.id}:${start}`}>{marked(fragment, leaf.data.marks)}</span>
      );
      const previous = groups.at(-1);
      if (previous?.key === key) {
        previous.text += fragment;
        previous.content.push(content);
      } else
        groups.push({
          position: `${leaf.id}:${start}`,
          key,
          text: fragment,
          content: [content],
          references: navigates ? [] : matching,
          owner,
        });
    }
    offset += text.length;
  }
  return groups.map((group) =>
    group.references.length ? (
      <Button
        key={group.position}
        type="button"
        aria-label={`${group.owner.data.kind === 'link' ? 'Source' : 'Evidence'} for ${group.text}`}
        aria-pressed={selected === group.key}
        onClick={() => onEvidence({ ...group.owner, id: group.key, evidence: group.references })}
        variant="inline"
      >
        {group.content}
      </Button>
    ) : (
      <span key={group.position}>{group.content}</span>
    ),
  );
}

export function WikiBlocks({
  blocks,
  onEvidence,
  selected,
  depth = 2,
  inheritedEvidence,
}: {
  blocks: WikiBlock[];
  onEvidence: (block: WikiBlock) => void;
  selected?: string;
  depth?: number;
  inheritedEvidence?: WikiBlock;
}) {
  return blocks.map((block) => (
    <Block
      key={block.id}
      block={block}
      onEvidence={onEvidence}
      selected={selected}
      depth={depth}
      inheritedEvidence={inheritedEvidence}
    />
  ));
}
function Block({
  block,
  onEvidence,
  selected,
  depth,
  inheritedEvidence,
}: {
  block: WikiBlock;
  onEvidence: (block: WikiBlock) => void;
  selected?: string;
  depth: number;
  inheritedEvidence?: WikiBlock;
}): ReactNode {
  const { data, children } = block;
  const citation = block.evidence.length ? block : inheritedEvidence;
  const inner = ['paragraph', 'heading', 'cell', 'item'].includes(String(data.kind)) ? (
    <>
      <InlineContent block={block} onEvidence={onEvidence} selected={selected} />
      <WikiBlocks
        blocks={children.filter(
          (child) => !['run', 'link', 'cite'].includes(String(child.data.kind)),
        )}
        onEvidence={onEvidence}
        selected={selected}
        depth={depth}
      />
    </>
  ) : (
    <WikiBlocks
      blocks={children}
      onEvidence={onEvidence}
      selected={selected}
      depth={depth}
      inheritedEvidence={citation}
    />
  );
  const text = typeof data.text === 'string' ? data.text : undefined;
  switch (data.kind) {
    case 'cite':
      return null;
    case 'run':
      return <InlineContent block={block} onEvidence={onEvidence} selected={selected} />;
    case 'link':
      return block.evidence.length ? (
        <Button
          type="button"
          aria-label={`Source for ${text}`}
          aria-pressed={selected === block.id}
          onClick={() => onEvidence(block)}
          variant="inline"
        >
          {text}
        </Button>
      ) : block.href && isSafeUrl(block.href) ? (
        <a href={block.href}>{text}</a>
      ) : (
        text
      );
    case 'section':
      return (
        <section id={block.id}>
          <WikiBlocks
            blocks={children}
            onEvidence={onEvidence}
            selected={selected}
            depth={Math.min(6, depth + 1)}
          />
        </section>
      );
    case 'heading': {
      const H = `h${Math.min(6, Math.max(2, depth - 1))}` as 'h2';
      return <H>{inner}</H>;
    }
    case 'paragraph':
      return <p id={block.id}>{inner}</p>;
    case 'list':
      return data.ordered ? <ol>{inner}</ol> : <ul>{inner}</ul>;
    case 'item':
      return <li>{inner}</li>;
    case 'quote':
      return <blockquote>{inner}</blockquote>;
    case 'table':
      return (
        <table>
          <tbody>{inner}</tbody>
        </table>
      );
    case 'row':
      return <tr>{inner}</tr>;
    case 'cell':
      return (
        <td data-align={data.align === 'center' || data.align === 'right' ? data.align : 'left'}>
          {inner}
        </td>
      );
    case 'code':
      return (
        <pre>
          <code>
            <InlineContent block={block} onEvidence={onEvidence} selected={selected} />
          </code>
        </pre>
      );
    case 'rule':
      return <hr />;
    case 'chart': {
      const chart = wikiSchemas.chart.safeParse(data);
      if (!chart.success) return <Text tone="muted">Chart unavailable.</Text>;
      return chart.data.series.map((series) => (
        <figure key={series.name}>
          <figcaption>
            {chart.data.title} · {series.name}
          </figcaption>
          {chart.data.chart === 'bar' ? (
            <Bars
              label={series.name}
              unit={chart.data.unit}
              data={series.values.map((value, i) => ({
                value,
                label: chart.data.x[i] ?? String(i),
              }))}
            />
          ) : (
            <Sparkline
              label={series.name}
              unit={chart.data.unit}
              values={series.values}
              labels={chart.data.x}
            />
          )}
        </figure>
      ));
    }
    case 'relationship':
      return (
        <p>
          {String(data.predicate)}:{' '}
          {block.href && isSafeUrl(block.href) ? (
            <a href={block.href}>{String(data.label ?? 'Related page')}</a>
          ) : (
            String(data.label ?? '')
          )}
        </p>
      );
    case 'date':
      return (
        <p>
          {String(data.date)} {String(data.label ?? '')}
          {inner}
        </p>
      );
    case 'timeline':
      return <section>{inner}</section>;
    case 'task':
      return (
        <p>
          {data.status === 'completed' ? '✓' : '○'} {String(data.what)} {String(data.due ?? '')}
        </p>
      );
    case 'question':
      return (
        <p>
          {String(data.text)}
          {data.abandoned ? ' (abandoned)' : ''}
        </p>
      );
    case 'decision':
      return (
        <p>
          {String(data.date)} · {String(data.what)} {String(data.why ?? '')}
          {inner}
        </p>
      );
    case 'query':
      return children.length ? (
        <ul>
          {children.map((child) => (
            <li key={child.id}>
              <Block block={child} onEvidence={onEvidence} selected={selected} depth={depth} />
            </li>
          ))}
        </ul>
      ) : (
        <p>No matching pages.</p>
      );
    default:
      return (
        <>
          {text}
          {inner}
        </>
      );
  }
}

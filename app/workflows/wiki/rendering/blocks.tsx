import type { ReactNode } from 'react';
import type { WikiBlock } from '../pages.ts';
import { isSafeUrl } from '../../../vault/documents/notes/safe-url.ts';
import { Bars, Sparkline } from '../../../ui/kit/index.ts';
import { wikiSchemas } from '../../../vault/records/wiki.ts';

export const blockText = (block: WikiBlock): string =>
  typeof block.data.text === 'string'
    ? block.data.text
    : block.children
        .filter((child) => child.data.kind !== 'cite')
        .map(blockText)
        .join('');

export function WikiBlocks({
  blocks,
  onEvidence,
  selected,
  depth = 2,
}: {
  blocks: WikiBlock[];
  onEvidence: (block: WikiBlock) => void;
  selected?: string;
  depth?: number;
}) {
  return blocks.map((block) => (
    <Block key={block.id} block={block} onEvidence={onEvidence} selected={selected} depth={depth} />
  ));
}
function Block({
  block,
  onEvidence,
  selected,
  depth,
}: {
  block: WikiBlock;
  onEvidence: (block: WikiBlock) => void;
  selected?: string;
  depth: number;
}): ReactNode {
  const { data, children } = block;
  const inner = (
    <WikiBlocks blocks={children} onEvidence={onEvidence} selected={selected} depth={depth} />
  );
  const text = typeof data.text === 'string' ? data.text : undefined;
  switch (data.kind) {
    case 'cite':
      return null;
    case 'run': {
      let content: ReactNode = text;
      for (const mark of Array.isArray(data.marks) ? data.marks : []) {
        if (mark === 'strong') content = <strong>{content}</strong>;
        else if (mark === 'emphasis') content = <em>{content}</em>;
        else if (mark === 'code') content = <code>{content}</code>;
        else if (mark === 'strike') content = <s>{content}</s>;
      }
      return content;
    }
    case 'link':
      return block.evidence.length ? (
        <button
          type="button"
          aria-label={`Source for ${text}`}
          aria-pressed={selected === block.id}
          onClick={() => onEvidence(block)}
          className="text-link underline decoration-dotted underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {text}
        </button>
      ) : block.href && isSafeUrl(block.href) ? (
        <a href={block.href}>{text}</a>
      ) : (
        text
      );
    case 'section':
      return (
        <section id={block.id} className="flex flex-col gap-3">
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
      return <H className="m-0 text-title">{inner}</H>;
    }
    case 'paragraph':
      return (
        <p id={block.id} className="m-0 whitespace-pre-wrap font-serif text-lead">
          {block.evidence.length ? (
            <button
              type="button"
              aria-label={`Evidence for ${blockText(block)}`}
              aria-pressed={selected === block.id}
              onClick={() => onEvidence(block)}
              className={
                selected === block.id
                  ? 'text-left underline decoration-people decoration-2 underline-offset-4 bg-people-soft rounded-sm'
                  : 'text-left underline decoration-border decoration-dotted decoration-2 underline-offset-4 hover:decoration-people focus-visible:outline-2 focus-visible:outline-ring'
              }
            >
              {blockText(block)}
            </button>
          ) : (
            (text ?? inner)
          )}
        </p>
      );
    case 'list':
      return data.ordered ? (
        <ol className="list-decimal pl-6">{inner}</ol>
      ) : (
        <ul className="list-disc pl-6">{inner}</ul>
      );
    case 'item':
      return <li>{inner}</li>;
    case 'quote':
      return <blockquote className="border-l-2 pl-4 font-serif">{inner}</blockquote>;
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table>
            <tbody>{inner}</tbody>
          </table>
        </div>
      );
    case 'row':
      return <tr>{inner}</tr>;
    case 'cell':
      return (
        <td
          className="border p-2"
          style={{
            textAlign: data.align === 'center' || data.align === 'right' ? data.align : 'left',
          }}
        >
          {inner}
        </td>
      );
    case 'code':
      return (
        <pre className="overflow-x-auto rounded border bg-muted p-3">
          <code>{text}</code>
        </pre>
      );
    case 'rule':
      return <hr />;
    case 'chart': {
      const chart = wikiSchemas.chart.safeParse(data);
      if (!chart.success) return <p>Chart unavailable.</p>;
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
        <p className="text-label text-muted-foreground">
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
        <ul className="list-disc pl-6">
          {children.map((child) => (
            <li key={child.id}>
              <Block block={child} onEvidence={onEvidence} selected={selected} depth={depth} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-label text-muted-foreground">No matching pages.</p>
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

export function WikiEvidence({ block }: { block: WikiBlock }) {
  return (
    <>
      <p className="m-0 font-serif text-copy">{blockText(block)}</p>
      {block.evidence.map((source) => (
        <section key={source.id} className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <p className="m-0 text-label text-muted-foreground">
            {source.author}
            {source.date ? ` · ${new Date(source.date).toLocaleString()}` : ''}
          </p>
          <blockquote className="m-0 whitespace-pre-wrap font-serif text-copy">
            {source.text}
          </blockquote>
          {source.href && isSafeUrl(source.href) && (
            <a className="text-link text-label" href={source.href}>
              Open source
            </a>
          )}
        </section>
      ))}
    </>
  );
}

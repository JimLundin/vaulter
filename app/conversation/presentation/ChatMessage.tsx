import { useMemo } from 'react';
import { LiveStatus, Markdown, Message, Stack, Text, ToolGroup } from '@/ui/kit/index.ts';
import { RecordedToolExecution, type ToolPresentationAdapter } from '@/agent/presentation/index.ts';
import { liveLabel, running, segments, summarize, type ToolPart } from '@/conversation/activity.ts';
import { renderMarkdown } from './rendering/markdown.ts';
import type { Turn } from '@/conversation/view.ts';

/** A recorded turn needs no store or execution controller to display accepted evidence. */
export function ChatMessage({
  turn,
  live = false,
  toolPresentations = [],
}: {
  turn: Turn;
  live?: boolean;
  toolPresentations?: readonly ToolPresentationAdapter[];
}) {
  const user = turn.role === 'user';
  const record = turn.role === 'record';
  const label = record ? (turn.record?.label ?? 'Recorded summary') : user ? 'You' : 'Agent';
  return (
    <Message
      label={label}
      side={user ? 'end' : 'start'}
      marker={turn.role}
      persistentLabel={record}
    >
      {record ? (
        <Said text={turn.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')} />
      ) : user ? (
        turn.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')
      ) : (
        <AgentTurn turn={turn} live={live} toolPresentations={toolPresentations} />
      )}
    </Message>
  );
}
function Said({ text }: { text: string }) {
  const body = useMemo(() => renderMarkdown(text), [text]);
  return <Markdown>{body}</Markdown>;
}
/** One call as its own row; two or more folded into a single summary line. */
function Tools({
  parts,
  live,
  toolPresentations,
}: {
  parts: ToolPart[];
  live: boolean;
  toolPresentations: readonly ToolPresentationAdapter[];
}) {
  if (parts.length === 1)
    return <RecordedToolExecution evidence={parts[0]} adapters={toolPresentations} live={live} />;
  return (
    <ToolGroup
      summary={summarize(parts, toolPresentations, live)}
      count={parts.length}
      running={live && !!running(parts)}
      error={parts.some((part) => part.status === 'failed' || part.status === 'cancelled')}
    >
      {parts.map((part, i) => (
        <RecordedToolExecution
          key={part.callId ?? i}
          evidence={part}
          adapters={toolPresentations}
          live={live}
        />
      ))}
    </ToolGroup>
  );
}
function AgentTurn({
  turn,
  live,
  toolPresentations,
}: {
  turn: Turn;
  live: boolean;
  toolPresentations: readonly ToolPresentationAdapter[];
}) {
  const tools = turn.parts.filter((p): p is ToolPart => p.kind === 'tool');
  const now = live ? running(tools) : undefined;
  return (
    <Stack>
      {segments(turn.parts).map((segment, i) =>
        segment.kind === 'text' ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments only append
          <Said key={i} text={segment.part.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments only append
          <Stack key={i}>
            <Tools parts={segment.parts} live={live} toolPresentations={toolPresentations} />
          </Stack>
        ),
      )}
      {live && !!now && <LiveStatus>{liveLabel(now, toolPresentations)}</LiveStatus>}
      {live && !turn.parts.length && <LiveStatus>Thinking…</LiveStatus>}
      {turn.status === 'unknown' && (
        <Text role="status" tone="subtle">
          Chat response is unfinished. Recorded agent activity is shown without resuming execution.
        </Text>
      )}
      {!!turn.error && (
        <Text size="sm" tone="danger">
          {turn.error}
        </Text>
      )}
      {!!(turn.model || turn.tokens) && (
        <Text size="xs" tone="subtle">
          {[
            turn.model,
            turn.tokens &&
              `${turn.tokens.in.toLocaleString()} in · ${turn.tokens.out.toLocaleString()} out`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      )}
    </Stack>
  );
}

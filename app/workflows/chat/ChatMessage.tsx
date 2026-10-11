import { useMemo } from 'react';
import {
  Json,
  LiveStatus,
  Markdown,
  Message,
  Stack,
  Text,
  ToolGroup,
  ToolResult,
} from '../../ui/kit/index.ts';
import { liveLabel, running, segments, summarize, type ToolPart } from './activity.ts';
import { renderBody } from './rendering/markdown.ts';
import type { Part, Turn } from './view.ts';

/** A recorded turn needs no store or execution controller to display accepted evidence. */
export function ChatMessage({ turn, live = false }: { turn: Turn; live?: boolean }) {
  const user = turn.role === 'user';
  return (
    <Message label={user ? 'You' : 'Agent'} side={user ? 'end' : 'start'} marker={turn.role}>
      {user ? (
        turn.parts.map((part) => (part.kind === 'text' ? part.text : '')).join('')
      ) : (
        <AgentTurn turn={turn} live={live} />
      )}
    </Message>
  );
}
function Said({ text }: { text: string }) {
  const body = useMemo(() => renderBody({ id: 'agent', path: 'agent.md', body: text }), [text]);
  return <Markdown>{body}</Markdown>;
}
function Tool({ part }: { part: Part & { kind: 'tool' } }) {
  return (
    <ToolResult
      title={part.input ? `${part.name} · ${part.input}` : part.name}
      status={part.result}
      error={part.error}
      input={part.args}
      output={part.result !== undefined ? <Json value={part.output} /> : undefined}
    />
  );
}
/** One call as its own row; two or more folded into a single summary line. */
function Tools({ parts }: { parts: ToolPart[] }) {
  if (parts.length === 1) return <Tool part={parts[0]} />;
  return (
    <ToolGroup
      summary={summarize(parts)}
      count={parts.length}
      running={!!running(parts)}
      error={parts.some((p) => p.error)}
    >
      {parts.map((part, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: calls only append
        <Tool key={i} part={part} />
      ))}
    </ToolGroup>
  );
}
function AgentTurn({ turn, live }: { turn: Turn; live: boolean }) {
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
            <Tools parts={segment.parts} />
          </Stack>
        ),
      )}
      {live && !!now && <LiveStatus>{liveLabel(now)}</LiveStatus>}
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

import type {
  RecordedToolEvidence,
  ToolPresentationAdapter,
} from '../../agent/tool-presentation.tsx';
import { Stack, Text } from '../../ui/kit/index.ts';
import type { JsonObject, JsonValue } from '../../vault/nodes/model.ts';
import { questionToolActions } from './tool-actions.ts';

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const object = (value: JsonValue | undefined): JsonObject | undefined =>
  isObject(value) ? value : undefined;
const times = (count: number) => (count === 1 ? '' : ` ${count} times`);

/** A recorded request and receipt are evidence; this view does not read today's Question state. */
export function QuestionToolReceipt({ evidence }: { evidence: RecordedToolEvidence }) {
  const input = object(evidence.input);
  const output = object(evidence.output);
  const text = typeof input?.text === 'string' ? input.text : output?.text;
  return (
    <Stack gap="xs">
      {typeof text === 'string' && <Text>{text}</Text>}
      {typeof input?.query === 'string' && <Text>Context query: {input.query}</Text>}
      {typeof output?.question === 'string' && (
        <Text size="xs">Recorded Question: {output.question}</Text>
      )}
      {typeof output?.transaction === 'string' && (
        <Text size="xs">Recorded transaction: {output.transaction}</Text>
      )}
      {typeof output?.status === 'string' && (
        <Text size="sm">Question status when read: {output.status}</Text>
      )}
    </Stack>
  );
}

export const questionToolPresentation: ToolPresentationAdapter = (evidence) => {
  if (evidence.version !== undefined) return;
  const action =
    evidence.name === questionToolActions.ask
      ? { title: 'Ask a Question', live: 'Retaining a Question', done: 'retained Questions' }
      : evidence.name === questionToolActions.read
        ? { title: 'Read a Question', live: 'Reading a Question', done: 'read Questions' }
        : evidence.name === questionToolActions.list
          ? { title: 'List Questions', live: 'Listing Questions', done: 'listed Questions' }
          : undefined;
  if (!action) return;
  const output = object(evidence.output);
  const accepted =
    evidence.name === questionToolActions.ask
      ? output?.accepted === true &&
        typeof output.question === 'string' &&
        typeof output.transaction === 'string'
      : evidence.name === questionToolActions.read
        ? typeof output?.question === 'string' && typeof output.text === 'string'
        : Array.isArray(evidence.output);
  return {
    title: action.title,
    live: action.live,
    done: (count) =>
      !accepted
        ? `used ${evidence.name}${times(count)}`
        : evidence.name === questionToolActions.ask
          ? `retained ${count} ${count === 1 ? 'Question' : 'Questions'}`
          : evidence.name === questionToolActions.read
            ? `read ${count} ${count === 1 ? 'Question' : 'Questions'}`
            : `${action.done}${times(count)}`,
    receipt: <QuestionToolReceipt evidence={evidence} />,
  };
};

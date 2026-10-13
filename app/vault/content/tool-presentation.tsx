import type {
  RecordedToolEvidence,
  ToolPresentationAdapter,
} from '../../agent/tool-presentation.tsx';
import { Stack, Text } from '../../ui/kit/index.ts';
import type { JsonObject, JsonValue } from '../nodes/model.ts';
import { contentToolActions } from './tool-actions.ts';

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const object = (value: JsonValue | undefined): JsonObject | undefined =>
  isObject(value) ? value : undefined;
const countNodes = (count: number) => `${count} ${count === 1 ? 'node' : 'nodes'}`;
const times = (count: number) => (count === 1 ? '' : ` ${count} times`);

/** The receipt keeps the recorded input and exact publication identity, never current content. */
export function ContentToolReceipt({ evidence }: { evidence: RecordedToolEvidence }) {
  const input = object(evidence.input);
  const output = object(evidence.output);
  const data = object(output?.data);
  const title = typeof input?.title === 'string' ? input.title : data?.title;
  const text = typeof input?.text === 'string' ? input.text : data?.text;
  return (
    <Stack gap="xs">
      {typeof title === 'string' && <Text>{title}</Text>}
      {typeof text === 'string' && <Text size="sm">{text}</Text>}
      {typeof output?.node === 'string' && <Text size="xs">Recorded node: {output.node}</Text>}
      {typeof output?.transaction === 'string' && (
        <Text size="xs">Recorded transaction: {output.transaction}</Text>
      )}
    </Stack>
  );
}

/** Unversioned records use the existing Content meanings; future versions retain raw evidence. */
export const contentToolPresentation: ToolPresentationAdapter = (evidence) => {
  if (evidence.version !== undefined) return;
  const output = object(evidence.output);
  const action =
    evidence.name === contentToolActions.create
      ? { title: 'Create content node', live: 'Creating a node', done: 'created' }
      : evidence.name === contentToolActions.read
        ? { title: 'Read content node', live: 'Reading a node', done: 'read' }
        : evidence.name === contentToolActions.update
          ? { title: 'Update content node', live: 'Updating a node', done: 'updated' }
          : undefined;
  if (!action) return;
  const accepted =
    typeof output?.node === 'string' &&
    typeof output.transaction === 'string' &&
    (evidence.name === contentToolActions.read ? !!object(output.data) : output.accepted === true);
  return {
    title: action.title,
    live: action.live,
    done: (count) =>
      accepted ? `${action.done} ${countNodes(count)}` : `used ${evidence.name}${times(count)}`,
    receipt: <ContentToolReceipt evidence={evidence} />,
  };
};

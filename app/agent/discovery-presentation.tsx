import type { JsonObject, JsonValue } from '@/vault/nodes/model.ts';
import type { ToolPresentationAdapter } from './tool-presentation.tsx';
import { discoveryActions } from './discovery.ts';
import { Stack, Text } from '@/ui/kit/index.ts';

const isObject = (value: JsonValue | undefined): value is JsonObject =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/** Agent owns discovery receipts, including their historical tool names. */
export const discoveryPresentation: ToolPresentationAdapter = (evidence) => {
  if (evidence.version !== undefined) return;
  const context = evidence.name === discoveryActions.context;
  if (!context && evidence.name !== discoveryActions.subjects) return;
  const input = isObject(evidence.input) ? evidence.input : undefined;
  const output = isObject(evidence.output) ? evidence.output : undefined;
  const sources = Array.isArray(output?.sources) ? output.sources : undefined;
  const knowledge = Array.isArray(output?.knowledge) ? output.knowledge : undefined;
  const accepted = context ? !!sources && !!knowledge : Array.isArray(evidence.output);
  return {
    title: context ? 'Read Question context' : 'List Question subjects',
    live: context ? 'Reading Question context' : 'Listing Question subjects',
    done: (count) =>
      `${accepted ? (context ? 'read Question context' : 'listed Question subjects') : `used ${evidence.name}`}${count === 1 ? '' : ` ${count} times`}`,
    receipt: (
      <Stack gap="xs">
        {typeof input?.query === 'string' && <Text>Context query: {input.query}</Text>}
        {sources !== undefined && knowledge !== undefined && (
          <Text size="sm">
            Retained context: {sources.length} sources · {knowledge.length} knowledge passages
          </Text>
        )}
      </Stack>
    ),
  };
};

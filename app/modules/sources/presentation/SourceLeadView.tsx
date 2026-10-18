import { Link, Stack, Text } from '@/shared/ui/kit/index.ts';
import { isSourceLeadUrl, type SourceLeadRecord } from '@/modules/sources/index.ts';

/** Reusable live or pinned lead presentation. The caller chooses which recorded state to supply. */
export function SourceLeadView({
  lead,
}: {
  lead: Pick<SourceLeadRecord, 'url' | 'title' | 'available'>;
}) {
  return (
    <Stack gap="sm">
      {isSourceLeadUrl(lead.url) ? (
        <Link href={lead.url} target="_blank" rel="noreferrer">
          {lead.title ?? lead.url}
        </Link>
      ) : (
        <Text>{lead.title ?? lead.url}</Text>
      )}
      {lead.title !== undefined && (
        <Text size="sm" tone="muted">
          {lead.url}
        </Text>
      )}
      <Text size="sm" tone="muted">
        {lead.available
          ? 'Source lead · content not captured'
          : 'Source lead removed · content not captured'}
      </Text>
    </Stack>
  );
}

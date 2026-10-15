import { Icon, Link, PassageCard, Row, Text } from '../../../ui/kit/index.ts';
import { isSafeUrl } from '../../../navigation/urls.ts';
import type { WikiReference } from '../pages.ts';

/** Citation attribution, exact selection and version meaning stay with Wiki. */
export function ReferenceCard({ reference }: { reference: WikiReference }) {
  const { title, href, context, author, date, range, state, speaker } = reference;
  const safeHref = href && isSafeUrl(href) ? href : undefined;
  const external = !!safeHref && /^https?:/.test(safeHref);
  const attribution = [
    speaker ? (speaker === 'user' ? 'User' : 'Agent report') : author,
    date ? new Date(date).toLocaleDateString() : '',
    external ? new URL(safeHref!).hostname : '',
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <PassageCard
      label={`Source from ${title}`}
      title={
        safeHref ? (
          <Link
            href={safeHref}
            target={external ? '_blank' : undefined}
            rel={external ? 'noreferrer' : undefined}
            plain={true}
          >
            <Text as="span" truncate={true}>
              {title}
            </Text>
            <Text as="span" aria-hidden="true">
              {external ? '↗' : '→'}
            </Text>
          </Link>
        ) : (
          title
        )
      }
      attribution={
        attribution ? (
          <Text size="xs" tone="muted" truncate={true} title={attribution}>
            {attribution}
          </Text>
        ) : undefined
      }
      text={context}
      selection={range}
      disclosureLabel={`Context from ${title}`}
      contextLabel="Source context"
      empty="No retained passage"
      notice={
        state !== 'original' ? (
          <Row align="start">
            <Icon name="history" size="sm" />
            <Text size="xs" tone="muted">
              {state === 'newer' ? 'Source has a newer version.' : 'Source was removed.'} This
              excerpt stays tied to the original.
            </Text>
          </Row>
        ) : undefined
      }
    />
  );
}

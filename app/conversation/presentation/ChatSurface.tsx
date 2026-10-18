import type { ReactNode } from 'react';
import {
  AutoScrollArea,
  Button,
  Dock,
  Heading,
  Icon,
  ReadingColumn,
  Row,
  Stack,
  SupportingPane,
  SplitView,
  Text,
  PageHeader,
} from '@/ui/kit/index.ts';

export type ChatPresentation =
  | { page: true }
  | { page?: false; open: boolean; onClose: () => void };

/** Chat supplies task content; the kit owns page/feed/dock and supporting-pane mechanics. */
export function ChatSurface({
  presentation,
  supporting,
  onTimeline,
  scrollTarget,
  composer,
  suggestions,
  status,
  empty,
  children,
}: {
  presentation: ChatPresentation;
  supporting?: ReactNode;
  onTimeline?: () => void;
  scrollTarget?: { index: number; request: number };
  composer: ReactNode;
  suggestions?: ReactNode;
  status?: ReactNode;
  empty?: boolean;
  children: ReactNode;
}) {
  const actions = onTimeline ? (
    <Row visible={presentation.page ? 'compact' : undefined}>
      <Button
        variant="ghost"
        size="compact"
        iconOnly={true}
        aria-label="Timeline"
        onClick={onTimeline}
      >
        <Icon name="list" />
      </Button>
    </Row>
  ) : undefined;
  const header = <Heading level={2}>Chat</Heading>;
  const dock = (
    <Stack gap="sm">
      {suggestions}
      <Row data-conversation-input="">
        <Stack grow={true} gap="none">
          {composer}
        </Stack>
      </Row>
    </Stack>
  );
  const page = (
    <Stack grow={true} fill={true} gap="none">
      <PageHeader title="Chat" label="Chat actions" actions={actions} />
      <ReadingColumn page={true} label="Conversation">
        <AutoScrollArea empty={empty} scrollTarget={scrollTarget}>
          {children}
        </AutoScrollArea>
        <Dock status={status}>{dock}</Dock>
      </ReadingColumn>
    </Stack>
  );
  return presentation.page ? (
    supporting ? (
      <SplitView main={page} supporting={supporting} />
    ) : (
      page
    )
  ) : (
    <>
      <SupportingPane
        title="Chat"
        header={header}
        actions={actions}
        open={presentation.open}
        onClose={presentation.onClose}
        dock={dock}
        status={status}
        empty={empty}
        scrollTarget={scrollTarget}
      >
        {children}
      </SupportingPane>
      {supporting}
    </>
  );
}

export function ChatWelcome() {
  return (
    <Stack gap="lg" block="md">
      <Heading level={1} serif={true} size="display">
        What’s on your mind?
      </Heading>
      <Text tone="muted">
        Speak to the agent, or type what to file and ask what your vault knows.
      </Text>
    </Stack>
  );
}

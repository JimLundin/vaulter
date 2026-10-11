import { type ReactNode, useEffect } from 'react';
import { Drawer } from './drawer.tsx';
import { AutoScrollArea, Dock } from './primitives.tsx';
import { useLayout } from './hooks/use-layout.ts';

/** One supporting policy: beside expanded content, full-height bottom Drawer in compact space.
 * Content is either a scrolling body, or a following feed with an anchored dock.
 */
export function SupportingPane({
  title,
  description,
  header,
  actions,
  open,
  onClose,
  persistent = false,
  onVisible,
  selection,
  dock,
  status,
  empty,
  children,
}: {
  title: string;
  description?: string;
  header?: ReactNode;
  actions?: ReactNode;
  open: boolean;
  onClose: () => void;
  /** Keeps the task visible beside the page; compact visibility still follows open. */
  persistent?: boolean;
  onVisible?: (visible: boolean) => void;
  /** A changed selection resets the shared scrolling body. */
  selection?: string | number;
  dock?: ReactNode;
  status?: ReactNode;
  empty?: boolean;
  children: ReactNode;
}) {
  const compact = useLayout() === 'compact';
  const visible = open || (persistent && !compact);
  useEffect(() => {
    onVisible?.(visible);
  }, [visible, onVisible]);
  return (
    <Drawer
      open={visible}
      onClose={onClose}
      title={title}
      description={description}
      header={header}
      actions={actions}
      placement="pane"
      dismissible={!persistent || compact}
      scroll={dock === undefined}
      scrollKey={selection}
    >
      {dock === undefined ? (
        children
      ) : (
        <>
          <AutoScrollArea empty={empty}>{children}</AutoScrollArea>
          <Dock status={status}>{dock}</Dock>
        </>
      )}
    </Drawer>
  );
}

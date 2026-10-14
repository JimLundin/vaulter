// Throwaway app-level docks. Viewport bounds, thumb placement and global editing set geometry.
import {
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Brand } from './app.tsx';
import { Icon } from './icons.tsx';
import type { NavigationAction, NavigationDestination } from './navigation.tsx';
import { usePresentationPolicy } from './presentation-policy.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './parts/dropdown-menu.tsx';

export type FreestandingDockDesign =
  | 'free-rail'
  | 'free-rail-single'
  | 'free-cluster'
  | 'free-orbit';

const defaultPlacement = { edge: 'right' as 'left' | 'right', height: 0.16 };

export function PrototypeAppDock({
  design,
  compact,
  editing,
  status,
  destinations,
  actions,
  onSearch,
  onNavigate,
  primary,
  primaryAction,
  footer,
}: {
  design: FreestandingDockDesign;
  compact: boolean;
  editing: boolean;
  status: ReactNode;
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  onSearch: () => void;
  onNavigate?: () => void;
  primary?: ReactNode;
  primaryAction?: NavigationAction;
  footer?: ReactNode;
}) {
  const policy = usePresentationPolicy();
  const dock = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ left: 0, top: 0, width: 390, height: 844 });
  const [placement, setPlacement] = useState(defaultPlacement);
  const [expanded, setExpanded] = useState(false);
  const [menu, setMenu] = useState<'navigation' | 'tools' | null>(null);
  const [dragPosition, setDragPosition] = useState<{ left: number; top: number } | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);
  const rail = design === 'free-rail' || design === 'free-rail-single';
  const single = design === 'free-rail-single';
  const bottomInset = editing ? 88 : 12;
  const minimal = design === 'free-orbit';
  const collapsed = minimal && !expanded;

  useLayoutEffect(() => {
    const measure = () => {
      const next = policy.bounds();
      setBounds({ left: next.left, top: next.top, width: next.width, height: next.height });
    };
    measure();
    return policy.watchBounds(measure);
  }, [policy]);

  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) {
      const rect = event.currentTarget.getBoundingClientRect();
      setPlacement({
        edge: rect.left + rect.width / 2 < bounds.left + bounds.width / 2 ? 'left' : 'right',
        height: Math.max(0, (bounds.top + bounds.height - rect.bottom) / bounds.height),
      });
    }
    drag.current = null;
    setDragPosition(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const flipEdge = () =>
    setPlacement((current) => ({
      ...current,
      edge: current.edge === 'right' ? 'left' : 'right',
    }));
  const moveWithKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (rail && !event.altKey) return;
    if (event.key === 'Home') setPlacement(defaultPlacement);
    else if (event.key === 'End') setPlacement((current) => ({ ...current, height: 0 }));
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      setPlacement((current) => ({
        ...current,
        edge: event.key === 'ArrowLeft' ? 'left' : 'right',
      }));
    else if (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      setPlacement((current) => ({
        ...current,
        height: Math.max(
          0,
          Math.min(0.6, current.height + (event.key === 'ArrowUp' ? 12 : -12) / bounds.height),
        ),
      }));
    else return;
    setMenu(null);
    event.preventDefault();
  };
  const destinationItems = destinations.map((entry) => (
    <DropdownMenuItem
      key={entry.href}
      render={<a href={entry.href} aria-current={entry.current ? 'page' : undefined} />}
      onClick={onNavigate}
    >
      <Icon name={entry.icon} />
      <span className="kit-app-dock-item-label">{entry.label}</span>
      {entry.current && <Icon name="check" />}
    </DropdownMenuItem>
  ));
  const actionItems = (
    <>
      {rail && (
        <>
          <DropdownMenuItem onClick={onSearch}>
            <Icon name="search" />
            Search
          </DropdownMenuItem>
          {primaryAction && (
            <DropdownMenuItem onClick={primaryAction.onSelect} disabled={primaryAction.disabled}>
              <Icon name={primaryAction.icon} />
              {primaryAction.label}
            </DropdownMenuItem>
          )}
        </>
      )}
      {actions.map((action) => (
        <DropdownMenuItem
          key={action.label}
          render={action.href ? <a href={action.href}>{action.label}</a> : undefined}
          onClick={action.onSelect}
          disabled={action.disabled}
        >
          <Icon name={action.icon} />
          {action.label}
        </DropdownMenuItem>
      ))}
    </>
  );
  const placementItems = (
    <>
      <DropdownMenuItem onClick={flipEdge}>
        <Icon name="mobile" />
        Use {placement.edge === 'right' ? 'left' : 'right'} thumb
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setPlacement((current) => ({ ...current, height: 0 }))}>
        <Icon name="grip" />
        Align to bottom
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => setPlacement(defaultPlacement)}>
        <Icon name="undo" />
        Reset dock position
      </DropdownMenuItem>
    </>
  );
  const menuControl = (
    <DropdownMenu
      open={menu === 'navigation'}
      onOpenChange={(open) =>
        setMenu((current) => (open ? 'navigation' : current === 'navigation' ? null : current))
      }
      modal={false}
    >
      <DropdownMenuTrigger
        aria-label={rail ? (single ? 'App menu' : 'Modules') : 'Menu'}
        className="kit-app-dock-control"
        data-app-dock-action="menu"
        title={
          rail
            ? 'Drag to reposition. Alt + arrow keys move; Alt + End aligns to bottom.'
            : 'Drag to reposition.'
        }
        onKeyDown={rail ? moveWithKeys : undefined}
      >
        <Icon name="list" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        anchor={dock}
        side={placement.edge === 'right' ? 'left' : 'right'}
        align="end"
        sideOffset={12}
        aria-label="App navigation"
        className="kit-app-dock-menu"
        style={{
          width: Math.min(260, bounds.width - (design === 'free-cluster' ? 140 : 92)),
          maxHeight: bounds.height - 24,
        }}
      >
        {rail && (
          <div className="kit-app-dock-menu-brand">
            <Brand status={status} />
          </div>
        )}
        <DropdownMenuGroup aria-label="Modules">
          {rail && <DropdownMenuLabel>Modules</DropdownMenuLabel>}
          {destinationItems}
        </DropdownMenuGroup>
        {(!rail || single) && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup aria-label="Tools">
              {rail && <DropdownMenuLabel>Tools</DropdownMenuLabel>}
              {actionItems}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup aria-label="Dock position">
              {rail && <DropdownMenuLabel>Dock position</DropdownMenuLabel>}
              {placementItems}
            </DropdownMenuGroup>
            {footer}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const toolsControl = (
    <DropdownMenu
      open={menu === 'tools'}
      onOpenChange={(open) =>
        setMenu((current) => (open ? 'tools' : current === 'tools' ? null : current))
      }
      modal={false}
    >
      <DropdownMenuTrigger
        aria-label="Tools"
        className="kit-app-dock-control"
        data-app-dock-action="tools"
        title="Drag to reposition. Alt + arrow keys move; Alt + End aligns to bottom."
        onKeyDown={moveWithKeys}
      >
        <Icon name="more" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        anchor={dock}
        side={placement.edge === 'right' ? 'left' : 'right'}
        align="end"
        sideOffset={12}
        aria-label="App tools"
        className="kit-app-dock-menu"
        style={{ width: Math.min(260, bounds.width - 92), maxHeight: bounds.height - 24 }}
      >
        <DropdownMenuGroup aria-label="Tools">
          <DropdownMenuLabel>Tools</DropdownMenuLabel>
          {actionItems}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup aria-label="Dock position">
          <DropdownMenuLabel>Dock position</DropdownMenuLabel>
          {placementItems}
        </DropdownMenuGroup>
        {footer}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const searchControl = (
    <button
      type="button"
      aria-label="Search"
      data-app-dock-action="search"
      className="kit-app-dock-control"
      onClick={onSearch}
    >
      <Icon name="search" />
    </button>
  );
  const primaryControl = primary && (
    <div data-app-dock-action="primary" className="kit-app-dock-primary">
      {primary}
    </div>
  );
  const launcher = (
    <button
      type="button"
      aria-label={expanded ? 'Close app dock' : 'Open app dock'}
      aria-expanded={expanded}
      className="kit-app-dock-control kit-app-dock-launcher"
      title="Drag to reposition. Open for app controls."
      onPointerDown={(event) => {
        if (editing) event.preventDefault();
      }}
      onClick={() => setExpanded((current) => !current)}
    >
      <Icon name={expanded ? 'close' : 'more'} />
    </button>
  );
  if (!compact) return null;
  return createPortal(
    <div
      data-app-dock-layer=""
      className="kit-app-dock-layer"
      style={{
        position: policy.bounded ? 'absolute' : 'fixed',
        left: policy.bounded ? 0 : bounds.left,
        top: policy.bounded ? 0 : bounds.top,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      <nav
        ref={dock}
        aria-label="App dock"
        data-app-dock={design}
        data-rail={rail ? '' : undefined}
        data-edge={placement.edge}
        data-collapsed={collapsed ? '' : undefined}
        data-expanded={expanded ? '' : undefined}
        data-dragging={dragPosition ? '' : undefined}
        className="kit-app-dock"
        style={
          {
            '--app-dock-bottom': `${Math.max(bottomInset, bounds.height * placement.height)}px`,
            ...(dragPosition
              ? { left: dragPosition.left, top: dragPosition.top, right: 'auto', bottom: 'auto' }
              : {}),
          } as CSSProperties
        }
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            !event.isPrimary ||
            drag.current ||
            !(event.target instanceof Node && event.currentTarget.contains(event.target))
          )
            return;
          suppressClick.current = false;
          const rect = event.currentTarget.getBoundingClientRect();
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: rect.left - bounds.left,
            top: rect.top - bounds.top,
            moved: false,
          };
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.moved && Math.hypot(dx, dy) < 8) return;
          current.moved = true;
          suppressClick.current = true;
          setMenu(null);
          event.currentTarget.setPointerCapture(event.pointerId);
          const orbit = design === 'free-orbit' && !collapsed;
          setDragPosition({
            left: Math.max(
              orbit && placement.edge === 'right' ? 88 : 12,
              Math.min(
                bounds.width -
                  event.currentTarget.offsetWidth -
                  (orbit && placement.edge === 'left' ? 88 : 12),
                current.left + dx,
              ),
            ),
            top: Math.max(
              orbit ? 108 : 12,
              Math.min(
                bounds.height - event.currentTarget.offsetHeight - bottomInset,
                current.top + dy,
              ),
            ),
          });
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget) finishDrag(event);
        }}
        onClickCapture={(event) => {
          if (!(suppressClick.current && event.detail)) return;
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {rail ? (
          <>
            {menuControl}
            {!single && toolsControl}
          </>
        ) : design === 'free-orbit' ? (
          <>
            <div className="kit-app-dock-orbit" hidden={collapsed}>
              {menuControl}
              {searchControl}
              {primaryControl}
            </div>
            {launcher}
          </>
        ) : collapsed ? (
          launcher
        ) : (
          <>
            {menuControl}
            {searchControl}
            {primaryControl}
            {minimal ? (
              launcher
            ) : (
              <button
                type="button"
                aria-label="Move dock"
                className="kit-app-dock-control kit-app-dock-grip"
                title="Drag to reposition. Tap to switch edges. Arrow keys move; Home resets."
                onClick={flipEdge}
                onKeyDown={moveWithKeys}
              >
                <Icon name="grip" />
              </button>
            )}
          </>
        )}
      </nav>
    </div>,
    policy.portal ?? document.body,
  );
}

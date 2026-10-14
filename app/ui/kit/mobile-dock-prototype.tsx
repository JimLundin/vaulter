// Throwaway app-level edge rails. Preferred thumb placement is independent of temporary clearance.
import {
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

export type FreestandingDockDesign = 'free-rail' | 'free-rail-single';

type Position = { left: number; top: number };
type Geometry = {
  bounds: { left: number; top: number; width: number; height: number };
  width: number;
  height: number;
  insets: { left: number; top: number; right: number; bottom: number };
  inputs: { left: number; top: number; right: number; bottom: number }[];
};
const defaultPlacement = { edge: 'right' as 'left' | 'right', height: 0.16 };

/** Choose the closest clear position along the edge, including while dragging. */
function resolveDockPosition(position: Position, geometry: Geometry): Position {
  const { bounds, width, height, insets, inputs } = geometry;
  const minTop = insets.top;
  const maxTop = Math.max(minTop, bounds.height - height - insets.bottom);
  const left = Math.max(insets.left, Math.min(bounds.width - width - insets.right, position.left));
  const top = Math.max(minTop, Math.min(maxTop, position.top));
  const gap = 8;
  const obstructions = inputs
    .filter(
      (rect) =>
        left + width + gap > rect.left - bounds.left && left - gap < rect.right - bounds.left,
    )
    .map((rect) => ({
      start: rect.top - bounds.top - height - gap,
      end: rect.bottom - bounds.top + gap,
    }));
  const candidates = [
    top,
    minTop,
    maxTop,
    ...obstructions.flatMap(({ start, end }) => [start, end]),
  ]
    .filter((candidate) => candidate >= minTop && candidate <= maxTop)
    .filter((candidate) =>
      obstructions.every(({ start, end }) => candidate <= start || candidate >= end),
    )
    .sort((a, b) => Math.abs(a - top) - Math.abs(b - top) || a - b);
  return { left, top: candidates[0] ?? minTop };
}

export function PrototypeAppDock({
  design,
  compact,
  status,
  destinations,
  actions,
  onSearch,
  onNavigate,
  primaryAction,
  footer,
}: {
  design: FreestandingDockDesign;
  compact: boolean;
  status: ReactNode;
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  onSearch: () => void;
  onNavigate?: () => void;
  primaryAction?: NavigationAction;
  footer?: ReactNode;
}) {
  const policy = usePresentationPolicy();
  const dock = useRef<HTMLElement>(null);
  const single = design === 'free-rail-single';
  const [geometry, setGeometry] = useState<Geometry>({
    bounds: { left: 0, top: 0, width: 390, height: 844 },
    width: 60,
    height: single ? 60 : 110,
    insets: { left: 12, top: 12, right: 12, bottom: 12 },
    inputs: [],
  });
  const { bounds, insets } = geometry;
  const [placement, setPlacement] = useState(defaultPlacement);
  const [menu, setMenu] = useState<'navigation' | 'tools' | null>(null);
  const [dragPosition, setDragPosition] = useState<Position | null>(null);
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    origin: Position;
    position: Position;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  useLayoutEffect(() => {
    const node = dock.current;
    if (!(compact && node?.parentElement)) return;
    const layer = node.parentElement;
    const measure = () => {
      const rect = policy.bounds();
      const style = getComputedStyle(layer);
      const next: Geometry = {
        bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        width: node.offsetWidth,
        height: node.offsetHeight,
        insets: {
          left: Number.parseFloat(style.paddingLeft),
          top: Number.parseFloat(style.paddingTop),
          right: Number.parseFloat(style.paddingRight),
          bottom: Number.parseFloat(style.paddingBottom),
        },
        inputs: policy
          .inputBounds()
          .map(({ left, top, right, bottom }) => ({ left, top, right, bottom })),
      };
      setGeometry((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    const releaseInputs = policy.watchInputs(measure);
    return () => {
      observer.disconnect();
      releaseInputs();
    };
  }, [compact, policy]);

  const position = resolveDockPosition(
    dragPosition ?? {
      left: placement.edge === 'left' ? insets.left : bounds.width - geometry.width - insets.right,
      top:
        bounds.height - geometry.height - Math.max(insets.bottom, bounds.height * placement.height),
    },
    geometry,
  );
  const finishDrag = (event: PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (current.moved) {
      // Save the requested placement, rather than the temporary input-safe rendering.
      setPlacement({
        edge: current.position.left + geometry.width / 2 < bounds.width / 2 ? 'left' : 'right',
        height: Math.max(
          0,
          (bounds.height - current.position.top - geometry.height) / bounds.height,
        ),
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
    if (!event.altKey) return;
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
          Math.min(1, current.height + (event.key === 'ArrowUp' ? 12 : -12) / bounds.height),
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
      {!!entry.current && <Icon name="check" />}
    </DropdownMenuItem>
  ));
  const actionItems = (
    <>
      <DropdownMenuItem onClick={onSearch}>
        <Icon name="search" />
        Search
      </DropdownMenuItem>
      {!!primaryAction && (
        <DropdownMenuItem onClick={primaryAction.onSelect} disabled={primaryAction.disabled}>
          <Icon name={primaryAction.icon} />
          {primaryAction.label}
        </DropdownMenuItem>
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
        data-edge={placement.edge}
        data-dragging={dragPosition ? '' : undefined}
        className="kit-app-dock"
        style={position}
        onPointerDown={(event) => {
          if (
            event.button !== 0 ||
            !event.isPrimary ||
            drag.current ||
            !(event.target instanceof Node && event.currentTarget.contains(event.target))
          )
            return;
          suppressClick.current = false;
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            origin: position,
            position,
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
          current.position = {
            left: Math.max(
              insets.left,
              Math.min(bounds.width - geometry.width - insets.right, current.origin.left + dx),
            ),
            top: Math.max(
              insets.top,
              Math.min(bounds.height - geometry.height - insets.bottom, current.origin.top + dy),
            ),
          };
          setDragPosition(current.position);
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
        <DropdownMenu
          open={menu === 'navigation'}
          onOpenChange={(open) =>
            setMenu((current) => (open ? 'navigation' : current === 'navigation' ? null : current))
          }
          modal={false}
        >
          <DropdownMenuTrigger
            aria-label={single ? 'App menu' : 'Modules'}
            className="kit-app-dock-control"
            data-app-dock-action="menu"
            title="Drag to reposition. Alt + arrow keys move; Alt + End aligns to bottom."
            onKeyDown={moveWithKeys}
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
            style={{ width: Math.min(260, bounds.width - 92), maxHeight: bounds.height - 24 }}
          >
            <div className="kit-app-dock-menu-brand">
              <Brand status={status} />
            </div>
            <DropdownMenuGroup aria-label="Modules">
              <DropdownMenuLabel>Modules</DropdownMenuLabel>
              {destinationItems}
            </DropdownMenuGroup>
            {single && (
              <>
                <DropdownMenuSeparator />
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
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {!single && (
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
        )}
      </nav>
    </div>,
    policy.portal ?? document.body,
  );
}

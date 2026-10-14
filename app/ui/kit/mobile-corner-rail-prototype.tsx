// Throwaway comparisons: fixed lower-right menus, with optional module-owned page controls above.
// Shared input surfaces leave room to the left; the app rail never follows a module's input.
import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brand } from './app.tsx';
import { Icon } from './icons.tsx';
import type { NavigationAction, NavigationDestination } from './navigation.tsx';
import type { PageSearchProps } from './page-controls-prototype.tsx';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './parts/input-group.tsx';
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

export type CornerRailDesign =
  | 'corner-split'
  | 'corner-tab'
  | 'corner-search'
  | 'corner-page-search'
  | 'corner-page-input';

export function PrototypeCornerRail({
  design,
  compact,
  status,
  destinations,
  actions,
  settings,
  pageActions,
  pageSearch,
  pageSearchVisible,
  onPageSearchOpen,
  onPageSearchClose,
  onPageSearchMeasure,
  onSearch,
  onNavigate,
  primaryAction,
  footer,
}: {
  design: CornerRailDesign;
  compact: boolean;
  status: ReactNode;
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  settings?: NavigationAction;
  pageActions?: ReactNode;
  pageSearch?: PageSearchProps & { id: string };
  pageSearchVisible?: boolean;
  onPageSearchOpen?: () => void;
  onPageSearchClose?: () => void;
  onPageSearchMeasure?: (clearance: number) => void;
  onSearch: () => void;
  onNavigate?: () => void;
  primaryAction?: NavigationAction;
  footer?: ReactNode;
}) {
  const policy = usePresentationPolicy();
  const rail = useRef<HTMLElement>(null);
  const split = design === 'corner-split';
  const tab = design === 'corner-tab';
  const directSearch = design === 'corner-search';
  const pageRail = design === 'corner-page-search' || design === 'corner-page-input';
  const searchButton = design === 'corner-page-search';
  const searchField = useRef<HTMLInputElement>(null);
  const searchSurface = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const focusSearch = useRef(false);
  const [menu, setMenu] = useState<'navigation' | 'tools' | null>(null);
  const [geometry, setGeometry] = useState({
    left: 0,
    top: 0,
    width: 390,
    height: 844,
    railWidth: tab ? 46 : 52,
    insetTop: 12,
    insetRight: 12,
    insetBottom: 12,
    insetLeft: 12,
  });

  useLayoutEffect(() => {
    if (pageSearchVisible && focusSearch.current) {
      searchField.current?.focus({ preventScroll: true });
      focusSearch.current = false;
    }
  }, [pageSearchVisible]);

  useLayoutEffect(() => {
    const node = rail.current;
    if (!(compact && node?.parentElement)) {
      setMenu(null);
      return;
    }
    const layer = node.parentElement;
    const marked = new Set<HTMLElement>();
    const clear = (surface: HTMLElement) => {
      surface.removeAttribute('data-corner-input-lane');
      surface.style.removeProperty('--corner-input-space');
      marked.delete(surface);
    };
    const measure = () => {
      const bounds = policy.bounds();
      const style = getComputedStyle(layer);
      const next = {
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        railWidth: node.offsetWidth,
        insetTop: Number.parseFloat(style.paddingTop),
        insetRight: Number.parseFloat(style.paddingRight),
        insetBottom: Number.parseFloat(style.paddingBottom),
        insetLeft: Number.parseFloat(style.paddingLeft),
      };
      setGeometry((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      if (pageSearchVisible && searchSurface.current)
        onPageSearchMeasure?.(searchSurface.current.offsetHeight + next.insetBottom + 12);
      const railLeft = bounds.right - next.insetRight - next.railWidth;
      const surfaces = new Set(policy.inputSurfaces());
      for (const surface of marked) if (!surfaces.has(surface)) clear(surface);
      for (const surface of surfaces) {
        const rect = surface.getBoundingClientRect();
        const dock = surface.hasAttribute('data-dock');
        // Measure from a stable outer edge, never from the already narrowed input's right edge.
        const space = Math.max(0, dock ? rect.right - railLeft + 12 : railLeft - rect.left - 12);
        const value = `${Math.round(space * 100) / 100}px`;
        const kind = dock ? 'dock' : 'field';
        if (surface.getAttribute('data-corner-input-lane') !== kind)
          surface.setAttribute('data-corner-input-lane', kind);
        if (surface.style.getPropertyValue('--corner-input-space') !== value)
          surface.style.setProperty('--corner-input-space', value);
        marked.add(surface);
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (searchSurface.current) observer.observe(searchSurface.current);
    const releaseInputs = policy.watchInputs(measure);
    return () => {
      observer.disconnect();
      releaseInputs();
      for (const surface of marked) clear(surface);
    };
  }, [compact, policy, pageSearchVisible, onPageSearchMeasure]);

  const menuWidth = Math.min(
    260,
    geometry.width - geometry.railWidth - geometry.insetRight - geometry.insetLeft - 12,
  );
  const menuStyle = {
    width: menuWidth,
    maxWidth: menuWidth,
    maxHeight: geometry.height - geometry.insetTop - geometry.insetBottom,
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
      {!directSearch && (
        <DropdownMenuItem onClick={onSearch}>
          <Icon name="search" />
          Search
        </DropdownMenuItem>
      )}
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
  if (!compact) return null;
  return createPortal(
    <div
      data-app-dock-layer=""
      className="kit-app-dock-layer"
      style={{
        position: policy.bounded ? 'absolute' : 'fixed',
        left: policy.bounded ? 0 : geometry.left,
        top: policy.bounded ? 0 : geometry.top,
        width: geometry.width,
        height: geometry.height,
      }}
    >
      {!!pageSearch && pageSearchVisible && (
        <search
          ref={searchSurface}
          aria-label={pageSearch.label}
          className="kit-corner-page-search"
          style={{
            left: Math.max(16, geometry.insetLeft),
            right: geometry.insetRight + geometry.railWidth + 12,
            bottom: geometry.insetBottom,
          }}
        >
          <InputGroup variant="composer">
            <InputGroupAddon>
              <Icon name="search" />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchField}
              type={pageSearch.type}
              aria-label={pageSearch.label}
              placeholder={pageSearch.placeholder}
              value={pageSearch.value}
              onChange={(event) => pageSearch.onValueChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                if (searchButton) {
                  pageSearch.onValueChange('');
                  onPageSearchClose?.();
                  searchTrigger.current?.focus({ preventScroll: true });
                } else event.currentTarget.blur();
              }}
            />
            {(searchButton || !!pageSearch.value) && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  iconOnly={true}
                  size="standard"
                  aria-label={pageSearch.value ? 'Clear search' : 'Close search'}
                  onClick={() => {
                    if (pageSearch.value) {
                      pageSearch.onValueChange('');
                      searchField.current?.focus({ preventScroll: true });
                    } else {
                      onPageSearchClose?.();
                      searchTrigger.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <Icon name="close" />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </search>
      )}
      <nav
        ref={rail}
        aria-label="App dock"
        data-app-dock={design}
        data-edge="right"
        className="kit-corner-rail"
        style={{ right: geometry.insetRight, bottom: geometry.insetBottom }}
      >
        {!!pageRail && (
          <>
            <div data-corner-page-actions="">{pageActions}</div>
            {!!pageSearch && searchButton && (
              <button
                ref={searchTrigger}
                type="button"
                aria-label={pageSearch.label}
                aria-expanded={pageSearchVisible}
                className="kit-corner-rail-control"
                data-app-dock-action="page-search"
                onClick={() => {
                  setMenu(null);
                  focusSearch.current = true;
                  if (pageSearchVisible) {
                    searchField.current?.focus({ preventScroll: true });
                    focusSearch.current = false;
                  } else onPageSearchOpen?.();
                }}
              >
                <Icon name="search" />
              </button>
            )}
          </>
        )}
        {directSearch && (
          <button
            type="button"
            aria-label="Search"
            data-app-dock-action="search"
            className="kit-corner-rail-control"
            onClick={() => {
              setMenu(null);
              onSearch();
            }}
          >
            <Icon name="search" />
          </button>
        )}
        <DropdownMenu
          open={menu === 'navigation'}
          onOpenChange={(open) =>
            setMenu((current) => (open ? 'navigation' : current === 'navigation' ? null : current))
          }
          modal={false}
        >
          <DropdownMenuTrigger
            aria-label={split || pageRail ? 'Modules' : 'App menu'}
            className="kit-corner-rail-control"
            data-app-dock-action="menu"
          >
            <Icon name={pageRail ? 'grid' : directSearch ? 'more' : 'list'} />
            {tab && <span className="kit-corner-rail-tab-label">Menu</span>}
          </DropdownMenuTrigger>
          <DropdownMenuContent
            anchor={rail}
            side="left"
            align="end"
            sideOffset={12}
            aria-label="App navigation"
            className="kit-app-dock-menu kit-corner-rail-menu"
            style={menuStyle}
          >
            <div className="kit-app-dock-menu-brand">
              <Brand
                status={status}
                actions={
                  settings && (
                    <DropdownMenuItem
                      className="kit-corner-brand-action"
                      aria-label={settings.label}
                      aria-expanded={settings.expanded}
                      title={settings.label}
                      disabled={settings.disabled}
                      render={
                        settings.href ? <a href={settings.href}>{settings.label}</a> : undefined
                      }
                      onClick={() => {
                        setMenu(null);
                        if (!settings.href) settings.onSelect?.();
                      }}
                    >
                      <Icon name={settings.icon} />
                    </DropdownMenuItem>
                  )
                }
              />
            </div>
            <DropdownMenuGroup aria-label="Modules">
              <DropdownMenuLabel>Modules</DropdownMenuLabel>
              {destinationItems}
            </DropdownMenuGroup>
            {!split && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup aria-label="Tools">
                  <DropdownMenuLabel>Tools</DropdownMenuLabel>
                  {actionItems}
                </DropdownMenuGroup>
                {!!footer && <div className="kit-app-dock-menu-brand">{footer}</div>}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {split && (
          <DropdownMenu
            open={menu === 'tools'}
            onOpenChange={(open) =>
              setMenu((current) => (open ? 'tools' : current === 'tools' ? null : current))
            }
            modal={false}
          >
            <DropdownMenuTrigger
              aria-label="Tools"
              className="kit-corner-rail-control"
              data-app-dock-action="tools"
            >
              <Icon name="more" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              anchor={rail}
              side="left"
              align="end"
              sideOffset={12}
              aria-label="App tools"
              className="kit-app-dock-menu kit-corner-rail-menu"
              style={menuStyle}
            >
              <DropdownMenuGroup aria-label="Tools">
                <DropdownMenuLabel>Tools</DropdownMenuLabel>
                {actionItems}
              </DropdownMenuGroup>
              {!!footer && <div className="kit-app-dock-menu-brand">{footer}</div>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </nav>
    </div>,
    policy.portal ?? document.body,
  );
}

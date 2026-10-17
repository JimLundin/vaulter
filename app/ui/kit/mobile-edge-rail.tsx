// App-owned navigation stays at the visible viewport's lower right. Shared fields reserve its lane.
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Brand } from './app.tsx';
import { Icon } from './icons.tsx';
import type { NavigationAction, NavigationDestination } from './navigation.tsx';
import type { PageSearchControl, PageFilterControl } from './page-controls.tsx';
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
  DropdownMenuCheckboxItem,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './parts/dropdown-menu.tsx';

export function MobileEdgeRail({
  compact,
  status,
  destinations,
  actions,
  settings,
  statusAction,
  pageActions,
  pageSearch,
  pageFilters,
  searchVisible,
  onSearchOpen,
  onSearchClose,
  onClearance,
  onSearch,
  onNavigate,
  primary,
  footer,
}: {
  compact: boolean;
  status: ReactNode;
  destinations: NavigationDestination[];
  actions: NavigationAction[];
  settings?: NavigationAction;
  statusAction?: NavigationAction;
  pageActions?: ReactNode;
  pageSearch?: PageSearchControl & { id: string };
  pageFilters?: PageFilterControl;
  searchVisible: boolean;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onClearance: (clearance: number) => void;
  onSearch: () => void;
  onNavigate?: () => void;
  primary?: NavigationAction;
  footer?: ReactNode;
}) {
  const policy = usePresentationPolicy();
  const rail = useRef<HTMLElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const searchSurface = useRef<HTMLElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const focusSearch = useRef(false);
  const menuPage = useRef(pageSearch?.id);
  const [menu, setMenu] = useState<'modules' | 'filters' | null>(null);
  const [geometry, setGeometry] = useState({
    left: 0,
    top: 0,
    width: 390,
    height: 844,
    railWidth: 52,
    insetTop: 12,
    insetRight: 12,
    insetBottom: 12,
    insetLeft: 12,
  });

  useLayoutEffect(() => {
    if (menuPage.current === pageSearch?.id) return;
    menuPage.current = pageSearch?.id;
    setMenu(null);
  }, [pageSearch?.id]);

  useLayoutEffect(() => {
    if (!(searchVisible && focusSearch.current)) return;
    searchField.current?.focus({ preventScroll: true });
    focusSearch.current = false;
  }, [searchVisible]);

  useLayoutEffect(() => {
    const node = rail.current;
    if (!(compact && node?.parentElement)) {
      setMenu(null);
      return;
    }
    const layer = node.parentElement;
    const marked = new Set<HTMLElement>();
    const clear = (surface: HTMLElement) => {
      surface.removeAttribute('data-edge-input-lane');
      surface.style.removeProperty('--edge-input-space');
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
      setGeometry((current) =>
        Object.keys(next).every(
          (key) => current[key as keyof typeof next] === next[key as keyof typeof next],
        )
          ? current
          : next,
      );
      onClearance(
        Math.max(
          node.offsetHeight,
          searchVisible ? (searchSurface.current?.offsetHeight ?? 0) : 0,
        ) +
          next.insetBottom +
          12,
      );
      const railLeft = bounds.right - next.insetRight - next.railWidth;
      const surfaces = new Set(policy.inputSurfaces());
      for (const surface of marked) if (!surfaces.has(surface)) clear(surface);
      for (const surface of surfaces) {
        // Keep app-owned search geometry independent from module input clearance.
        if (surface.closest('[data-page-search-layer]')) continue;
        const rect = surface.getBoundingClientRect();
        const dock = surface.hasAttribute('data-dock');
        // Measure stable outer edges so applying clearance never narrows a field repeatedly.
        const space = Math.max(0, dock ? rect.right - railLeft + 12 : railLeft - rect.left - 12);
        const value = `${Math.round(space * 100) / 100}px`;
        const kind = dock ? 'dock' : 'field';
        if (surface.getAttribute('data-edge-input-lane') !== kind)
          surface.setAttribute('data-edge-input-lane', kind);
        if (surface.style.getPropertyValue('--edge-input-space') !== value)
          surface.style.setProperty('--edge-input-space', value);
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
  }, [compact, policy, searchVisible, onClearance]);

  if (!compact) return null;
  const menuWidth = Math.max(
    0,
    Math.min(
      260,
      geometry.width - geometry.railWidth - geometry.insetRight - geometry.insetLeft - 12,
    ),
  );
  const menuStyle = {
    width: menuWidth,
    maxWidth: menuWidth,
    maxHeight: Math.max(0, geometry.height - geometry.insetTop - geometry.insetBottom),
  };
  const layerStyle: CSSProperties = {
    position: policy.bounded ? 'absolute' : 'fixed',
    left: policy.bounded ? 0 : geometry.left,
    top: policy.bounded ? 0 : geometry.top,
    width: geometry.width,
    height: geometry.height,
  };
  return createPortal(
    <>
      {!!pageSearch && searchVisible && (
        <div
          data-page-search-layer=""
          className="kit-edge-rail-layer kit-page-search-layer"
          style={layerStyle}
        >
          <search
            ref={searchSurface}
            aria-label={pageSearch.label}
            className="kit-edge-page-search"
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
                  pageSearch.onValueChange('');
                  onSearchClose();
                  searchTrigger.current?.focus({ preventScroll: true });
                }}
              />
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
                      onSearchClose();
                      searchTrigger.current?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <Icon name="close" />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </search>
        </div>
      )}
      <div data-edge-rail-layer="" className="kit-edge-rail-layer" style={layerStyle}>
        <nav
          ref={rail}
          aria-label="App controls"
          data-edge-rail=""
          className="kit-edge-rail"
          style={{ right: geometry.insetRight, bottom: geometry.insetBottom }}
        >
          <div data-edge-page-actions="">{pageActions}</div>
          {!!pageSearch && (
            <button
              ref={searchTrigger}
              type="button"
              aria-label={pageSearch.label}
              aria-expanded={searchVisible}
              className="kit-edge-rail-control"
              onClick={() => {
                setMenu(null);
                if (searchVisible) searchField.current?.focus({ preventScroll: true });
                else {
                  focusSearch.current = true;
                  onSearchOpen();
                }
              }}
            >
              <Icon name="search" />
            </button>
          )}
          {!!pageFilters && (
            <DropdownMenu
              open={menu === 'filters'}
              onOpenChange={(open) =>
                setMenu((current) => (open ? 'filters' : current === 'filters' ? null : current))
              }
              modal={false}
            >
              <DropdownMenuTrigger
                aria-label="Filters"
                aria-description={`${pageFilters.label}: ${
                  pageFilters.options
                    .filter((option) =>
                      pageFilters.type === 'multiple'
                        ? pageFilters.value.includes(option.value)
                        : pageFilters.value === option.value,
                    )
                    .map((option) => option.label)
                    .join(', ') || 'None'
                }`}
                className="kit-edge-rail-control"
                data-filtered={pageFilters.active || undefined}
              >
                <Icon name="filter" />
                {!!pageFilters.active && (
                  <span aria-hidden={true} className="kit-edge-filter-indicator" />
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent
                anchor={rail}
                side="left"
                align="end"
                sideOffset={12}
                aria-label="Page filters"
                className="kit-edge-rail-menu"
                style={menuStyle}
              >
                <DropdownMenuLabel>{pageFilters.label}</DropdownMenuLabel>
                {pageFilters.type === 'multiple' ? (
                  <DropdownMenuGroup aria-label={pageFilters.label}>
                    {pageFilters.options.map((option) => (
                      <DropdownMenuCheckboxItem
                        key={option.value}
                        checked={pageFilters.value.includes(option.value)}
                        closeOnClick={false}
                        onCheckedChange={(checked) =>
                          pageFilters.onValueChange(
                            checked
                              ? [...pageFilters.value, option.value]
                              : pageFilters.value.filter((value) => value !== option.value),
                          )
                        }
                      >
                        <span className="kit-edge-item-label">{option.label}</span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuGroup>
                ) : (
                  <DropdownMenuRadioGroup
                    aria-label={pageFilters.label}
                    value={pageFilters.value}
                    onValueChange={(value) => {
                      pageFilters.onValueChange(value);
                      setMenu(null);
                    }}
                  >
                    {pageFilters.options.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        <span className="kit-edge-item-label">{option.label}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <DropdownMenu
            open={menu === 'modules'}
            onOpenChange={(open) =>
              setMenu((current) => (open ? 'modules' : current === 'modules' ? null : current))
            }
            modal={false}
          >
            <DropdownMenuTrigger
              aria-label="Modules"
              data-app-modules=""
              className="kit-edge-rail-control kit-edge-modules-anchor"
            >
              <Icon name="grid" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              anchor={rail}
              side="left"
              align="end"
              sideOffset={12}
              aria-label="App navigation"
              data-app-navigation=""
              className="kit-edge-rail-menu"
              style={menuStyle}
            >
              <div className="kit-edge-menu-brand">
                <Brand
                  status={status}
                  statusAction={statusAction}
                  menu={true}
                  onAction={() => setMenu(null)}
                  actions={
                    settings && (
                      <DropdownMenuItem
                        className="kit-edge-brand-action"
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
                {destinations.map((entry) => (
                  <DropdownMenuItem
                    key={entry.href}
                    render={
                      <a href={entry.href} aria-current={entry.current ? 'page' : undefined} />
                    }
                    onClick={onNavigate}
                  >
                    <Icon name={entry.icon} />
                    <span className="kit-edge-item-label">{entry.label}</span>
                    {!!entry.current && <Icon name="check" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup aria-label="Tools">
                <DropdownMenuLabel>Tools</DropdownMenuLabel>
                <DropdownMenuItem aria-label="Search" onClick={onSearch}>
                  <Icon name="search" />
                  Search
                </DropdownMenuItem>
                {!!primary && (
                  <DropdownMenuItem onClick={primary.onSelect} disabled={primary.disabled}>
                    <Icon name={primary.icon} />
                    {primary.label}
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
              </DropdownMenuGroup>
              {!!footer && <div className="kit-edge-menu-brand">{footer}</div>}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </>,
    policy.portal ?? document.body,
  );
}

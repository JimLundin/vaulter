// Design review frame: the live product retains its state while its bounded viewport rearranges.
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { PresentationContext, usePresentation } from './presentation.tsx';
import { sizeClassForWidth, useLayout } from './hooks/use-layout.ts';
import { Button } from './parts/button.tsx';
import { Icon } from './icons.tsx';
import { PreviewBar } from './surfaces.tsx';
import { PreviewVariantSwitcher, PreviewVariantContext } from './preview-variants.tsx';
import { cn } from './lib/utils.ts';
import { FloatingPreview } from './floating-preview.tsx';

export function DesignPreview({
  label,
  kitHref,
  onReset,
  variantControls,
  children,
  variants,
}: {
  label: string;
  kitHref: string;
  onReset: () => void;
  variantControls?: ReactNode;
  children: ReactNode;
  variants?: {
    label: string;
    target: string;
    parameter?: string;
    defaultValue?: string;
    options: readonly { value: string; label: string }[];
  };
}) {
  const readVariant = useCallback(
    () =>
      variants
        ? (new URLSearchParams(location.search).get(variants.parameter ?? 'variant') ??
          variants.defaultValue ??
          variants.options[0]?.value)
        : undefined,
    [variants],
  );
  const [variantValue, setVariantValue] = useState(readVariant);
  const changeVariant = (value: string) => {
    if (!variants) return;
    const url = new URL(location.href);
    url.searchParams.set(variants.parameter ?? 'variant', value);
    history.replaceState(history.state, '', url);
    setVariantValue(value);
  };
  useEffect(() => {
    const read = () => setVariantValue(readVariant());
    globalThis.addEventListener('popstate', read);
    return () => globalThis.removeEventListener('popstate', read);
  }, [readVariant]);
  const [mobile, setMobile] = useState(false);
  const compact = useLayout() === 'compact';
  const parent = usePresentation();
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = root.current;
    if (!(node && portal)) return;
    const measure = () => {
      node.style.setProperty(
        '--design-height',
        `${parent?.portal.clientHeight ?? window.visualViewport?.height ?? window.innerHeight}px`,
      );
      node.style.setProperty(
        '--design-top',
        `${parent ? 0 : (window.visualViewport?.offsetTop ?? 0)}px`,
      );
      setBounds((current) =>
        current.width === portal.clientWidth && current.height === portal.clientHeight
          ? current
          : { width: portal.clientWidth, height: portal.clientHeight },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(portal);
    if (parent) observer.observe(parent.portal);
    window.visualViewport?.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [portal, parent]);
  const presentation = useMemo(
    () =>
      portal && bounds.width && bounds.height
        ? { portal, layout: sizeClassForWidth(bounds.width) }
        : null,
    [portal, bounds.width, bounds.height],
  );
  return (
    <div
      ref={root}
      data-design-preview={mobile ? 'mobile' : 'window'}
      className={cn(
        'relative flex h-[var(--design-height,var(--viewport-height,100dvh))] min-h-0 flex-col overflow-hidden bg-surface',
        !parent && 'kit-design-window',
      )}
    >
      <FloatingPreview>
        <PreviewBar
          label={label}
          kitHref={kitHref}
          onReset={onReset}
          controls={
            <>
              <Button
                variant="ghost"
                size={compact ? 'standard' : 'compact'}
                aria-pressed={mobile}
                title="Constrain the preview to mobile width. Turn off to fit the window."
                onClick={() => setMobile((current) => !current)}
                className="rounded-full aria-pressed:bg-accent"
              >
                <Icon name="mobile" />
                Mobile
              </Button>
              {variants && (
                <PreviewVariantSwitcher
                  label={variants.label}
                  options={variants.options}
                  value={variantValue ?? variants.options[0]?.value}
                  onChange={changeVariant}
                />
              )}
              {variantControls}
            </>
          }
        />
      </FloatingPreview>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
        <div
          data-design-viewport=""
          className={cn(
            'kit-preview design-viewport mx-auto h-full',
            mobile ? 'w-[min(390px,100%)]' : 'w-full',
          )}
        >
          <div
            ref={setPortal}
            className="kit-presentation"
            data-kit-pointer={mobile ? 'coarse' : undefined}
            style={
              {
                '--viewport-height': `${bounds.height}px`,
                '--viewport-top': '0px',
              } as React.CSSProperties
            }
          >
            {presentation && (
              <PresentationContext.Provider value={presentation}>
                <PreviewVariantContext.Provider
                  value={variants && variantValue ? { [variants.target]: variantValue } : {}}
                >
                  {children}
                </PreviewVariantContext.Provider>
              </PresentationContext.Provider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

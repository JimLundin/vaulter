// Design review frame: the live product retains its state while its bounded viewport rearranges.
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PresentationContext, usePresentation } from './presentation.tsx';
import { sizeClassForWidth } from './hooks/use-layout.ts';
import { RadioGroup, RadioGroupItem } from './parts/radio-group.tsx';
import { PreviewBar } from './surfaces.tsx';
import { cn } from './lib/utils.ts';

type Device = 'window' | 'desktop' | 'mobile';

export function DesignPreview({
  label,
  kitHref,
  onReset,
  prototypeControls,
  children,
}: {
  label: string;
  kitHref: string;
  onReset: () => void;
  prototypeControls?: ReactNode;
  children: ReactNode;
}) {
  const [device, setDevice] = useState<Device>('window');
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
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', measure);
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
      data-design-preview={device}
      className="flex h-[var(--design-height,var(--viewport-height,100dvh))] min-h-0 flex-col overflow-hidden bg-surface"
    >
      <PreviewBar
        label={label}
        kitHref={kitHref}
        onReset={onReset}
        controls={
          <>
            <RadioGroup
              variant="segmented"
              aria-label="Preview device"
              value={device}
              onValueChange={(value) => setDevice(value as Device)}
            >
              <RadioGroupItem value="window">Window</RadioGroupItem>
              <RadioGroupItem value="desktop">Desktop</RadioGroupItem>
              <RadioGroupItem value="mobile">Mobile</RadioGroupItem>
            </RadioGroup>
            {prototypeControls}
          </>
        }
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-x-auto">
        <div
          data-design-viewport=""
          className={cn(
            'kit-preview design-viewport mx-auto h-full',
            device === 'mobile'
              ? 'w-[min(390px,100%)]'
              : device === 'desktop'
                ? 'w-full min-w-[1024px]'
                : 'w-full',
          )}
        >
          <div
            ref={setPortal}
            className="kit-presentation"
            data-kit-pointer={device === 'mobile' ? 'coarse' : undefined}
            style={
              {
                '--viewport-height': `${bounds.height}px`,
                '--viewport-top': '0px',
              } as React.CSSProperties
            }
          >
            {presentation && (
              <PresentationContext.Provider value={presentation}>
                {children}
              </PresentationContext.Provider>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

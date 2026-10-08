// Kit-internal presentation scope. The gallery supplies bounds; the app uses the browser normally.
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { ScrollArea } from './parts/scroll-area.tsx';
import type { SizeClass } from './hooks/use-layout.ts';

interface Presentation {
  layout: SizeClass;
  portal: HTMLDivElement;
}
const PresentationContext = createContext<Presentation | null>(null);
export const usePresentation = () => useContext(PresentationContext);

/** Live, bounded specimens without a second document or duplicated component implementations. */
export function PresentationPreview({
  device,
  height,
  children,
}: {
  device: 'desktop' | 'mobile';
  height: number;
  children: ReactNode;
}) {
  const [portal, setPortal] = useState<HTMLDivElement | null>(null);
  const value = useMemo<Presentation | null>(
    () => (portal ? { layout: device === 'mobile' ? 'compact' : 'expanded', portal } : null),
    [device, portal],
  );
  return (
    <div
      data-kit-preview={device}
      className="kit-preview"
      style={{ width: device === 'mobile' ? 390 : 800, height }}
    >
      <div
        ref={setPortal}
        className="kit-presentation"
        data-kit-pointer={device === 'mobile' ? 'coarse' : 'fine'}
        style={
          { '--viewport-height': `${height - 2}px`, '--viewport-top': '0px' } as React.CSSProperties
        }
      >
        {value && (
          <PresentationContext.Provider value={value}>
            <ScrollArea fill={true} className="kit-specimen-content">
              {children}
            </ScrollArea>
          </PresentationContext.Provider>
        )}
      </div>
    </div>
  );
}

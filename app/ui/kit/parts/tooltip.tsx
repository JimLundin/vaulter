import { usePresentationPolicy } from '../presentation-policy.tsx';
import { cn } from '../lib/utils.ts';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useAnchoredPositioning } from './use-anchored-positioning.ts';

function TooltipProvider({
  delayDuration = 0,
  ...props
}: Omit<TooltipPrimitive.Provider.Props, 'delay'> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delayDuration} {...props} />
  );
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  side = 'top',
  align = 'center',
  alignOffset,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset'>) {
  const policy = usePresentationPolicy();
  const positioning = useAnchoredPositioning();
  return (
    <TooltipPrimitive.Portal container={policy.portal}>
      <TooltipPrimitive.Positioner
        className="z-50"
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        {...positioning}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          role="tooltip"
          className={cn(
            'z-50 w-fit origin-(--transform-origin) animate-in rounded-md bg-foreground px-3 py-1.5 text-xs text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };

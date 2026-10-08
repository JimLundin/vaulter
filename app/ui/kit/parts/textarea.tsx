import * as React from 'react';
import { cn } from '../lib/utils.ts';

function Textarea({
  className,
  variant = 'default',
  ref: forwardedRef,
  ...props
}: React.ComponentProps<'textarea'> & { variant?: 'default' | 'inline' }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    // Dictated input follows incoming words without focusing the field or opening a keyboard.
    if (props.readOnly && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [props.value, props.readOnly]);
  return (
    <textarea
      ref={(node) => {
        ref.current = node;
        if (typeof forwardedRef === 'function') return forwardedRef(node);
        if (forwardedRef) forwardedRef.current = node;
      }}
      data-slot="textarea"
      className={cn(
        'flex field-sizing-content min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-field shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40',
        variant === 'inline' &&
          'h-11 min-h-11 min-w-0 flex-1 field-sizing-fixed resize-none rounded-xl border-0 bg-transparent px-3 py-3 leading-5 placeholder:text-subtle-foreground placeholder:text-sm shadow-none focus-visible:ring-0',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };

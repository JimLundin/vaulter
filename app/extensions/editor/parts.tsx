// What Changes, History and Edit share: a diff's lines, and the dialog that confirms a step.
import type { ReactNode } from 'react';
import { cn } from 'cn';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog.tsx';

/** Unified-diff lines ("+…", "-…", "@@…", " …"), coloured, in the box they sit in. */
export function DiffLines({ lines }: { lines: string[] }) {
  return (
    <pre className="m-0 overflow-x-auto bg-background py-1.5 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a diff line is its position; the same text can recur
          key={i}
          className={cn(
            'min-h-[1lh] whitespace-pre-wrap break-words px-3',
            l[0] === '+' && 'bg-success/10 text-success',
            l[0] === '-' && 'bg-destructive/10 text-destructive',
            l.startsWith('@@') && 'mt-1.5 bg-surface text-faint first:mt-0',
          )}
        >
          {l}
        </div>
      ))}
    </pre>
  );
}

/** A trigger that asks first: `onConfirm` runs on the dialog's action. */
export function Confirm({
  trigger,
  title,
  description,
  action,
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action: string;
  destructive?: boolean;
  onConfirm: () => unknown;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild={true}>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {!!description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => onConfirm()}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

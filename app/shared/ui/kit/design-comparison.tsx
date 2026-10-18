// A design session supplies named examples; selection belongs to this preview alone.
import { type ReactNode, useState } from 'react';
import { DesignCycle } from './design-cycle.tsx';

type DesignAlternative = { id: string; label: string; content: ReactNode };

export function DesignComparison({
  alternatives,
  defaultValue,
  onValueChange,
  preview,
}: {
  alternatives: readonly [DesignAlternative, ...DesignAlternative[]];
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Place the picker and selected content inside a shared preview frame. */
  preview?: (controls: ReactNode, content: ReactNode) => ReactNode;
}) {
  const [value, setValue] = useState(defaultValue ?? alternatives[0].id);
  const selected = alternatives.find((alternative) => alternative.id === value) ?? alternatives[0];
  const controls = (
    <DesignCycle
      label="Design variation"
      value={selected.id}
      options={alternatives.map((alternative) => ({
        value: alternative.id,
        label: alternative.label,
      }))}
      onChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
  const content = (
    <div key={selected.id} className="h-full min-h-0 min-w-0 overflow-auto">
      {selected.content}
    </div>
  );
  if (preview) return preview(controls, content);
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <span className="text-caption text-muted-foreground">Design variation</span>
        {controls}
      </div>
      <div className="min-h-0 min-w-0 flex-1">{content}</div>
    </div>
  );
}

// A design session supplies named examples; selection belongs to this preview alone.
import { type ReactNode, useState } from 'react';
import { useLayout } from './hooks/use-layout.ts';
import { RadioGroup, RadioGroupItem } from './parts/radio-group.tsx';

type DesignAlternative = { id: string; label: string; content: ReactNode };

export function DesignComparison({
  alternatives,
  defaultValue,
}: {
  alternatives: readonly [DesignAlternative, ...DesignAlternative[]];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? alternatives[0].id);
  const selected = alternatives.find((alternative) => alternative.id === value) ?? alternatives[0];
  const compact = useLayout() === 'compact';
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        <span className="text-caption text-muted-foreground">Design variation</span>
        {compact ? (
          <select
            aria-label="Design variation"
            className="kit-preview-select max-w-full flex-1"
            value={selected.id}
            onChange={(event) => setValue(event.target.value)}
          >
            {alternatives.map((alternative) => (
              <option key={alternative.id} value={alternative.id}>
                {alternative.label}
              </option>
            ))}
          </select>
        ) : (
          <RadioGroup
            variant="segmented"
            aria-label="Design variation"
            value={selected.id}
            onValueChange={(next) => setValue(next)}
            className="max-w-full flex-wrap"
          >
            {alternatives.map((alternative) => (
              <RadioGroupItem key={alternative.id} value={alternative.id}>
                {alternative.label}
              </RadioGroupItem>
            ))}
          </RadioGroup>
        )}
      </div>
      <div key={selected.id} className="min-h-0 min-w-0 flex-1 overflow-auto">
        {selected.content}
      </div>
    </div>
  );
}

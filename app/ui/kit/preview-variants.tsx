// URL-backed prototype choices use the same focused control as local comparisons.
import { createContext, useContext } from 'react';
import { DesignCycle } from './design-cycle.tsx';

export function PreviewVariantSwitcher({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <DesignCycle
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      previousLabel="Previous variant"
      nextLabel="Next variant"
    />
  );
}

export const PreviewVariantContext = createContext<Readonly<Record<string, string>>>({});
/** Preview overrides target a rendered component, never a production controller. */
export const usePreviewVariant = (target: string) => useContext(PreviewVariantContext)[target];

import { useLayout } from './use-layout.ts';

export function useIsMobile() {
  return useLayout() === 'compact';
}

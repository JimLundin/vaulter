import type { ComponentProps } from 'react';
import { expectTypeOf } from 'vitest';
import type { SupportingPane } from './index.ts';

// public supporting content and task actions cannot configure styling or interaction geometry.
{
  expectTypeOf<ComponentProps<typeof SupportingPane>>().not.toHaveProperty('style');
  expectTypeOf<ComponentProps<typeof SupportingPane>>().not.toHaveProperty('className');
  expectTypeOf<ComponentProps<typeof SupportingPane>>().not.toHaveProperty('placement');
  expectTypeOf<ComponentProps<typeof SupportingPane>>().not.toHaveProperty('modal');
  expectTypeOf<ComponentProps<typeof SupportingPane>>().not.toHaveProperty('initialFocus');
}

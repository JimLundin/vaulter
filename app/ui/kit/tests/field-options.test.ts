import type { ComponentProps } from 'react';
import { expectTypeOf, it } from 'vitest';
import type { Field, FieldLegend, InputGroupAddon } from '../index.ts';

it('fields expose the retained semantic arrangements and standard legend', () => {
  expectTypeOf<ComponentProps<typeof FieldLegend>>().not.toHaveProperty('variant');
  expectTypeOf<NonNullable<ComponentProps<typeof Field>['orientation']>>().toEqualTypeOf<
    'vertical' | 'horizontal' | 'setting'
  >();
});

it('grouped inputs expose leading, trailing and inset context', () => {
  expectTypeOf<NonNullable<ComponentProps<typeof InputGroupAddon>['align']>>().toEqualTypeOf<
    'inline-start' | 'inline-end' | 'inset-end'
  >();
});

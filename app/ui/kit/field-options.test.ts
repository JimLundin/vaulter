import type { ChangeEventHandler, ComponentProps } from 'react';
import { expectTypeOf, it } from 'vitest';
import type { Field, FieldLegend, InputGroupAddon, Select } from './index.ts';

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

it('selects accept supplied choices and native changes without styling or children', () => {
  type Props = ComponentProps<typeof Select>;
  expectTypeOf<Props['options']>().toEqualTypeOf<readonly { value: string; label: string }[]>();
  expectTypeOf<NonNullable<Props['onChange']>>().toEqualTypeOf<
    ChangeEventHandler<HTMLSelectElement>
  >();
  expectTypeOf<Props['children']>().toEqualTypeOf<undefined>();
  expectTypeOf<Props>().not.toHaveProperty('className');
  expectTypeOf<Props>().not.toHaveProperty('style');
});

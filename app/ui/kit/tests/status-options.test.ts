import type { ComponentProps } from 'react';
import { expectTypeOf, it } from 'vitest';
import type { Choices, Kbd, KeyHint } from '../index.ts';

it('question and keyboard hints expose ordinary retained presentation', () => {
  expectTypeOf<ComponentProps<typeof Choices>>().not.toHaveProperty('numbered');
  expectTypeOf<ComponentProps<typeof Kbd>>().not.toHaveProperty('large');
  expectTypeOf<ComponentProps<typeof KeyHint>>().not.toHaveProperty('strong');
});

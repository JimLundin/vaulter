// The rule that keeps every screen coherent: what the kit hands to extensions takes no `className` and
// no `style`, in its types and at runtime too, so an extension composes the kit and never styles it.
import { type ComponentType, createElement } from 'react';

export type Unstyled<P> = Omit<P, 'className' | 'style'>;

export function unstyled<P extends object>(component: ComponentType<P>) {
  const Unstyled = (props: Unstyled<P>) => {
    const {
      className: _c,
      style: _s,
      ...rest
    } = props as Unstyled<P> & { className?: unknown; style?: unknown };
    return createElement(component, rest as P);
  };
  Unstyled.displayName = component.displayName ?? component.name;
  return Unstyled;
}

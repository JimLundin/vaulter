// Private environment policy. Adapters retain the library's focus, collision and gesture mechanics.
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { usePresentation } from './presentation.tsx';
import { useLayout } from './hooks/use-layout.ts';

type Surface = { id: string; parent?: string };
type Environment = { surfaces: Surface[] };
const environments = new WeakMap<object, Environment>();
const serverEnvironment = {};
const SurfaceContext = createContext<string | undefined>(undefined);

interface InteractionScopes {
  roots: Map<HTMLElement, number>;
  active?: HTMLElement;
}
const interactionScopes = new WeakMap<Document, InteractionScopes>();

function interactionScope(scopes: InteractionScopes | undefined, target: EventTarget | null) {
  let owner: HTMLElement | undefined;
  for (const root of scopes?.roots.keys() ?? []) {
    if (target instanceof Node && root.contains(target) && (!owner || owner.contains(root))) {
      owner = root;
    }
  }
  return owner;
}

/** Focus can fall back to the body when a task disables its focused control. */
function retainInteractionScope(portal: HTMLElement) {
  const document = portal.ownerDocument;
  let scopes = interactionScopes.get(document);
  if (!scopes) {
    scopes = { roots: new Map() };
    interactionScopes.set(document, scopes);
  }
  const current = scopes;
  current.roots.set(portal, (current.roots.get(portal) ?? 0) + 1);
  const remember = (event: Event) => {
    const { target } = event;
    // Losing a disabled or removed control is not a new interaction with the catalogue.
    if (event.type === 'focusin' && target === document.body) return;
    current.active = interactionScope(current, target);
  };
  document.addEventListener('pointerdown', remember, true);
  document.addEventListener('focusin', remember, true);
  if (portal.contains(document.activeElement)) current.active = portal;
  return () => {
    document.removeEventListener('pointerdown', remember, true);
    document.removeEventListener('focusin', remember, true);
    const remaining = (current.roots.get(portal) ?? 1) - 1;
    if (remaining) current.roots.set(portal, remaining);
    else {
      current.roots.delete(portal);
      if (current.active === portal) current.active = undefined;
    }
    if (!current.roots.size) interactionScopes.delete(document);
  };
}

type ChangeDetails = { reason: string; event: Event; cancel: () => void };

export function usePresentationPolicy() {
  const presentation = usePresentation();
  const layout = useLayout();
  const portal = presentation?.portal;
  const environment = useMemo(() => {
    const root = portal ?? globalThis.document ?? serverEnvironment;
    let value = environments.get(root);
    if (!value) {
      value = { surfaces: [] };
      environments.set(root, value);
    }
    return value;
  }, [portal]);
  return useMemo(
    () => ({
      portal,
      layout,
      bounded: !!portal,
      modal: !portal,
      positioning: {
        collisionBoundary: portal,
        ...(portal
          ? { collisionAvoidance: { side: 'none' as const, align: 'none' as const } }
          : {}),
      },
      environment,
      owns(target: EventTarget | null) {
        return !portal || (target instanceof Node && portal.contains(target));
      },
      bounds() {
        return portal?.getBoundingClientRect() ?? new DOMRect(0, 0, innerWidth, innerHeight);
      },
    }),
    [portal, layout, environment],
  );
}

export function PresentationSurface({ id, children }: { id: string; children: ReactNode }) {
  return <SurfaceContext.Provider value={id}>{children}</SurfaceContext.Provider>;
}

/** Libraries request dismissal; the environment selects the relevant surface. */
export function usePresentationSurface(open: boolean) {
  const policy = usePresentationPolicy();
  const id = useId();
  const parent = useContext(SurfaceContext);
  useLayoutEffect(() => {
    if (!open) return;
    const surface = { id, parent };
    policy.environment.surfaces.push(surface);
    const releaseInteraction = policy.portal && retainInteractionScope(policy.portal);
    return () => {
      releaseInteraction?.();
      policy.environment.surfaces = policy.environment.surfaces.filter(
        (entry) => entry !== surface,
      );
    };
  }, [open, id, parent, policy.environment, policy.portal]);
  return {
    id,
    policy,
    allowClose(details: ChangeDetails) {
      if (details.reason === 'escape-key') {
        const active = document.activeElement;
        const focused =
          active instanceof HTMLElement &&
          active !== document.body &&
          active !== document.documentElement &&
          active.isConnected &&
          !active.matches(':disabled') &&
          active.getClientRects().length > 0 &&
          getComputedStyle(active).visibility === 'visible';
        const ownsKeyboard =
          !policy.portal ||
          (focused
            ? interactionScope(interactionScopes.get(document), active) === policy.portal
            : interactionScopes.get(document)?.active === policy.portal);
        if (!ownsKeyboard || policy.environment.surfaces.at(-1)?.id !== id) {
          details.cancel();
          return false;
        }
      }
      if (['outside-press', 'focus-out', 'sibling-open'].includes(details.reason)) {
        const target =
          details.event instanceof FocusEvent
            ? (details.event.relatedTarget ?? details.event.target)
            : details.event.target;
        if (!policy.owns(target)) {
          details.cancel();
          return false;
        }
      }
      return true;
    },
  };
}

type FocusTarget = { node: HTMLElement; tag: string; name: string; labelled: boolean };

/** Remember the opener path, including a command in Search which disappears on selection. */
export function usePresentationFocus(open: boolean) {
  const policy = usePresentationPolicy();
  const targets = useRef<FocusTarget[]>([]);
  const focusScope = useRef(policy.portal);
  if (focusScope.current !== policy.portal) {
    targets.current = [];
    focusScope.current = policy.portal;
  }
  useEffect(() => {
    if (open) return;
    const remember = () => {
      const node = document.activeElement;
      if (!(node instanceof HTMLElement && policy.owns(node))) return;
      targets.current = [
        {
          node,
          tag: node.tagName.toLowerCase(),
          name: node.getAttribute('aria-label') ?? node.textContent ?? '',
          labelled: node.hasAttribute('aria-label'),
        },
        ...targets.current.filter((target) => target.node !== node),
      ].slice(0, 10);
    };
    if (!targets.current.length) remember();
    document.addEventListener('focusin', remember);
    return () => document.removeEventListener('focusin', remember);
  }, [open, policy]);
  return () => {
    const visible = (node: HTMLElement) =>
      node.isConnected &&
      !node.matches(':disabled') &&
      node.getClientRects().length > 0 &&
      getComputedStyle(node).visibility === 'visible' &&
      policy.owns(node);
    for (const same of targets.current) {
      if (same.tag === 'body') continue;
      const target = visible(same.node)
        ? same.node
        : [...(policy.portal ?? document).querySelectorAll<HTMLElement>(same.tag)].find(
            (node) =>
              visible(node) &&
              (same.labelled ? node.getAttribute('aria-label') : node.textContent) === same.name,
          );
      if (target) return target;
    }
  };
}

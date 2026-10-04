import { describe, expect, it } from 'vitest';
import { match, registry } from './registry.ts';

const view = (id: string, route: string) => ({ id, route, title: id, component: () => null });

describe('routes', () => {
  it('match the most specific route, with its parameters', () => {
    const r = registry();
    r.addView(view('page', '/wiki/:id'), 'wiki');
    r.addView(view('new', '/wiki/new'), 'wiki');
    expect(match(r.views(), '/wiki/new')?.view.item.id).toBe('new');
    expect(match(r.views(), '/wiki/caf%C3%A9')?.params).toEqual({ id: 'café' });
    expect(match(r.views(), '/notes')).toBeUndefined();
  });
  it('go when the extension that added them removes them', () => {
    const r = registry();
    const stop = r.addView(view('notes', '/notes'), 'notes');
    stop();
    expect(r.views()).toEqual([]);
  });
});

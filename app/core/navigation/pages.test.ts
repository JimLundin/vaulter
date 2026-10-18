// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { createElement } from 'react';
import { Text } from '@/shared/ui/kit/index.ts';
import { definePage, renderPage, pageCommands, pageNavigation } from './pages.ts';
import { pattern } from './routing.ts';

test('module routes mount their view with supplied context and preserve encoded detail links', () => {
  const collection = pattern('/pages/');
  const detail = pattern('/pages/:key/');
  const View = ({ title }: { title: string }) => createElement(Text, null, title);
  const page = definePage({
    patterns: [collection, detail],
    component: View,
    destination: { label: 'Pages', href: collection.href(), icon: 'book' },
    command: { id: 'go.pages', keys: 'g p' },
  });
  const href = detail.href({ key: 'Ada / notes' });
  expect(detail.match(href)).toEqual({ key: 'Ada / notes' });
  expect(renderPage(href, [page.mount({ title: 'Ada' }, 'Ada')], 'missing')).toEqual(
    createElement(View, { title: 'Ada', key: 'Ada' }),
  );
  expect(renderPage('/unknown/', [page.mount({ title: 'Ada' })], 'missing')).toBe('missing');
  expect(pageNavigation(href, [page])).toEqual([
    { label: 'Pages', href: '/pages/', icon: 'book', current: true },
  ]);
  const [command] = pageCommands([page]);
  expect(command).toMatchObject({ id: 'go.pages', label: 'Pages', keys: 'g p' });
  command.run();
  expect(location.hash).toBe('#/pages/');
});

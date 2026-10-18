import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { SourceLeadView } from './SourceLeadView.tsx';

test('embedded leads label uncaptured material and only render safe external links', () => {
  const lead = { url: 'HTTPS://Example.com/path', title: 'A lead', available: true };
  const html = renderToStaticMarkup(<SourceLeadView lead={lead} />);
  expect(html).toContain('href="HTTPS://Example.com/path"');
  expect(html).toContain('content not captured');
  const removed = renderToStaticMarkup(<SourceLeadView lead={{ ...lead, available: false }} />);
  expect(removed).toContain('Source lead removed');
  const unsafe = renderToStaticMarkup(
    <SourceLeadView lead={{ ...lead, url: 'javascript:alert(1)' }} />,
  );
  expect(unsafe).not.toContain('<a');
});

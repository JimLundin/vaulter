// The live catalogue uses one sample implementation at both presentation sizes, without iframes.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { compositions } from './composition.ts';
import { catalogue, type Specimen } from './catalogue.tsx';
import { ScrollArea } from './parts/scroll-area.tsx';
import { PresentationPreview } from './presentation.tsx';
import { Brand, Input, Text, ThemeSwitch } from './index.ts';

function Comparison({
  specimen,
  onLocate,
}: {
  specimen: Specimen;
  onLocate: (id: string) => void;
}) {
  const { Sample } = specimen;
  const buildingBlocks = [
    ...new Set(
      compositions
        .filter((item) => (item.families as readonly string[]).includes(specimen.id))
        .flatMap((item) => item.primitives),
    ),
  ];
  const height = [
    'navigation',
    'agent',
    'agent-panel',
    'settings',
    'access',
    'frames',
    'sidebar',
    'maps',
  ].includes(specimen.id)
    ? 640
    : 440;
  return (
    <section id={specimen.id} data-kit-comparison={specimen.id} className="kit-comparison">
      <header className="kit-comparison-heading">
        <h2>{specimen.title}</h2>
        <p>{specimen.description}</p>
        <Text size="xs" tone="subtle">
          {buildingBlocks.length ? 'Composition' : 'Component family'} ·{' '}
          {specimen.components.length} components
        </Text>
        <div className="kit-component-names">
          {specimen.components.map((name) => (
            <code key={name}>{name}</code>
          ))}
        </div>
        {!!buildingBlocks.length && (
          <div className="kit-building-blocks">
            <span>Built from</span>
            {buildingBlocks.map((name) => (
              <a
                key={name}
                href={`#${catalogue.find((item) => (item.components as string[]).includes(name))?.id}`}
                onClick={() =>
                  onLocate(
                    catalogue.find((item) => (item.components as string[]).includes(name))!.id,
                  )
                }
              >
                {name}
              </a>
            ))}
          </div>
        )}
      </header>
      <ScrollArea
        axis="horizontal"
        className="kit-comparison-scroll"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard scrolling for the wide comparison canvas.
        tabIndex={0}
        aria-label={`${specimen.title} desktop and mobile comparison`}
      >
        <div className="kit-comparison-pair">
          {(['desktop', 'mobile'] as const).map((device) => (
            <div key={device} className="kit-device">
              <div className="kit-device-label">
                <strong>{device === 'desktop' ? 'Desktop' : 'Mobile'}</strong>
                <span>{device === 'desktop' ? '800px · mouse' : '390px · touch'}</span>
              </div>
              <PresentationPreview device={device} height={height}>
                <div className={specimen.fullBleed ? 'kit-sample kit-sample-full' : 'kit-sample'}>
                  <Sample />
                </div>
              </PresentationPreview>
            </div>
          ))}
        </div>
      </ScrollArea>
    </section>
  );
}
function Gallery() {
  const [filter, setFilter] = useState('');
  const query = filter.trim().toLowerCase();
  const visible = catalogue.filter((item) =>
    `${item.title} ${item.components.join(' ')}`.toLowerCase().includes(query),
  );
  const count = new Set(catalogue.flatMap((item) => item.components)).size;
  return (
    <div className="kit-gallery">
      <header className="kit-gallery-header">
        <Brand />
        <div className="kit-gallery-heading">
          <h1>Component kit</h1>
          <p>One UI, resized and rearranged.</p>
        </div>
        <ThemeSwitch />
      </header>
      <div className="kit-gallery-intro">
        <Text>
          {count} components in {catalogue.length} live comparisons. Each pair renders the same
          example with its own layout and input mode.
        </Text>
        <Text size="sm" tone="muted">
          Interact with either sample. Menus stay inside their example. On a narrow screen, scroll
          each comparison sideways.
        </Text>
        <Input
          type="search"
          aria-label="Find a component"
          placeholder="Find a component or family…"
          value={filter}
          onChange={(event) => setFilter(event.currentTarget.value)}
        />
        <nav aria-label="Component families" className="kit-gallery-index">
          {visible.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.title}
            </a>
          ))}
        </nav>
      </div>
      <main className="kit-gallery-main">
        {visible.map((specimen) => (
          <Comparison
            key={specimen.id}
            specimen={specimen}
            onLocate={(id) => {
              setFilter('');
              requestAnimationFrame(() =>
                document.getElementById(id)?.scrollIntoView({ block: 'start' }),
              );
            }}
          />
        ))}
        {!visible.length && <Text>No matching components.</Text>}
      </main>
    </div>
  );
}
export function gallery(host: HTMLElement) {
  createRoot(host).render(<Gallery />);
}

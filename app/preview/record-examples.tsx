// Independent record examples stay outside the production kit catalogue.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/newsreader';
import { createRoot } from 'react-dom/client';
import '../ui/kit/styles.css';
import {
  DesignComparison,
  DesignPreview,
  Heading,
  PresentationPreview,
  Row,
  ScrollArea,
  Stack,
  startTheme,
} from '../ui/kit/index.ts';
import { WikiExample } from './wiki-example.tsx';

function Examples() {
  return (
    <Stack inset="page" block="lg">
      <Heading level={1}>Fictional module records</Heading>
      <ScrollArea axis="horizontal">
        <Row>
          {(['desktop', 'mobile'] as const).map((device) => (
            <Stack
              key={device}
              role="region"
              aria-label={`${device === 'desktop' ? 'Desktop' : 'Mobile'} Wiki example`}
            >
              <Heading level={2}>
                {device === 'desktop' ? 'Desktop' : 'Mobile'} Wiki example
              </Heading>
              <PresentationPreview device={device} height={640}>
                <DesignComparison
                  alternatives={[
                    { id: 'current', label: 'Current Wiki', content: <WikiExample /> },
                  ]}
                  preview={(controls, content) => (
                    <DesignPreview
                      label="Fictional Wiki records"
                      kitHref={import.meta.env.DEV ? '/ui/kit/' : '../kit/'}
                      onReset={() => location.reload()}
                      variantControls={controls}
                    >
                      {content}
                    </DesignPreview>
                  )}
                />
              </PresentationPreview>
            </Stack>
          ))}
        </Row>
      </ScrollArea>
    </Stack>
  );
}
startTheme();
createRoot(document.getElementById('app')!).render(<Examples />);

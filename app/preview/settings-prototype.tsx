// Throwaway comparison: can containers and navigation make settings easier to scan?
// Three layouts share the same fictional, memory-only preferences.
import { useState, type ReactNode } from 'react';
import { ModuleSettings } from '@/settings/ModuleSettings.tsx';
import { type SettingsDefinition, createSettings } from '@/settings/store.ts';
import { agentSettings } from '@/agent/settings.ts';
import { createOpenAISettings } from '@/agent/openai/settings.ts';
import { githubSettings } from '@/vault/storage/settings.ts';
import {
  Button,
  Drawer,
  Heading,
  Input,
  Row,
  Select,
  SettingField,
  SettingsDisclosure,
  SettingsInfo,
  Stack,
  Surface,
  Text,
} from '@/ui/kit/index.ts';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

export type SettingsVariant = 'cards' | 'categories' | 'overview';
type Category = 'general' | 'agent' | 'voice' | 'connections';
const categories: { id: Category; title: string; description: string }[] = [
  { id: 'general', title: 'General', description: 'Appearance and device preferences' },
  { id: 'agent', title: 'Agent', description: 'Chat model, instructions and run limits' },
  { id: 'voice', title: 'Voice & dictation', description: 'Spoken responses and transcription' },
  { id: 'connections', title: 'Connections', description: 'OpenAI and Vault storage' },
];

function Container({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Surface as="section" aria-label={title} variant="subtle">
      <Row justify="between" wrap={true}>
        <Stack gap="xs">
          <Heading level={3}>{title}</Heading>
          {description ? (
            <Text size="sm" tone="muted">
              {description}
            </Text>
          ) : null}
        </Stack>
        {action}
      </Row>
      {children}
    </Surface>
  );
}

export function SettingsPrototype({
  variant,
  open,
  onClose,
  chatDefinition,
}: {
  chatDefinition: SettingsDefinition;
  variant: SettingsVariant;
  open: boolean;
  onClose: () => void;
}) {
  const [stores] = useState(() => {
    const storage = memoryStorage();
    const provider = createOpenAISettings();
    return {
      provider,
      openai: createSettings(provider, { storage }),
      agent: createSettings(agentSettings, { storage }),
      chat: createSettings(chatDefinition, { storage }),
    };
  });
  const [theme, setTheme] = useState('system');
  const [category, setCategory] = useState<Category>('general');
  const [detail, setDetail] = useState<Category | null>(null);
  const [connection, setConnection] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const fields = (which: 'openai' | 'agent' | 'chat', keys: string[], disclosure?: string) => (
    <ModuleSettings
      definition={
        which === 'openai' ? stores.provider : which === 'agent' ? agentSettings : chatDefinition
      }
      store={stores[which]}
      keys={keys}
      disclosure={disclosure}
    />
  );
  const content = (id: Category) => {
    switch (id) {
      case 'general':
        return (
          <Container title="Appearance" description="Make this device feel like yours.">
            <SettingField
              label="Theme"
              description="Choose a theme, or follow your device's appearance."
            >
              <Select
                value={theme}
                onChange={(event) => setTheme(event.currentTarget.value)}
                options={[
                  { value: 'system', label: 'System' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
              />
            </SettingField>
          </Container>
        );
      case 'agent':
        return (
          <Stack gap="lg">
            <Container title="Chat model" description="Choose the model for new Agent responses.">
              {fields('openai', ['model'])}
            </Container>
            <Container title="Instructions" description="Personalize how the Agent helps you.">
              {fields('chat', ['instructions'], 'Edit instructions')}
            </Container>
            <Container title="Run limits" description="Bound how much work each Agent run can do.">
              {fields('agent', ['maxSteps', 'maxOutputTokens'], 'Adjust limits')}
            </Container>
          </Stack>
        );
      case 'voice':
        return (
          <Stack gap="lg">
            <Container
              title="Spoken responses"
              description="The voice you hear when speaking with the Agent."
            >
              {fields('openai', ['voice'])}
            </Container>
            <Container
              title="Voice and transcription models"
              description="Most people can use the defaults."
            >
              {fields(
                'openai',
                ['voiceModel', 'liveTranscriptionModel', 'fileTranscriptionModel'],
                'Choose models',
              )}
            </Container>
          </Stack>
        );
      case 'connections':
        return (
          <Stack gap="lg">
            {['OpenAI', 'GitHub storage'].map((name) => (
              <Container
                key={name}
                title={name}
                description={
                  name === 'OpenAI' ? 'Models, voice and dictation' : 'JimLundin/vault · main'
                }
                action={
                  <Button
                    variant="outline"
                    size="compact"
                    onClick={() => {
                      setConnection(connection === name ? null : name);
                      setKeyDraft('');
                      setKeySaved(false);
                    }}
                  >
                    {connection === name ? 'Done' : 'Manage'}
                  </Button>
                }
              >
                <Text size="sm" tone="muted">
                  Connected · Using login value
                </Text>
                {connection === name ? (
                  <Stack gap="lg">
                    <SettingField
                      label={name === 'OpenAI' ? 'OpenAI API key' : 'GitHub token'}
                      description="Replace the connection credential for this device."
                    >
                      <Input
                        type="password"
                        autoComplete="new-password"
                        value={keyDraft}
                        onChange={(event) => setKeyDraft(event.currentTarget.value)}
                        placeholder="Enter a replacement key"
                      />
                    </SettingField>
                    <Row>
                      <Button
                        variant="outline"
                        size="compact"
                        disabled={!keyDraft.trim()}
                        onClick={() => {
                          setKeyDraft('');
                          setKeySaved(true);
                        }}
                      >
                        Save key
                      </Button>
                    </Row>
                    {keySaved ? (
                      <Text size="sm" role="status">
                        Saved for this preview
                      </Text>
                    ) : null}
                    <SettingsDisclosure title="Installation details">
                      {name === 'OpenAI' ? (
                        <SettingsInfo
                          label="OpenAI API endpoint"
                          value="https://api.openai.com/v1"
                        />
                      ) : (
                        githubSettings.fields
                          .filter((field) => field.kind === 'readonly')
                          .map((field) => (
                            <SettingsInfo
                              key={field.key}
                              label={field.label}
                              value={field.defaultValue ?? ''}
                            />
                          ))
                      )}
                    </SettingsDisclosure>
                  </Stack>
                ) : null}
              </Container>
            ))}
            <Container
              title="Troubleshooting"
              description="Connection recovery and provider retry behavior."
            >
              {fields('agent', ['maxRetries'], 'Adjust retries')}
            </Container>
          </Stack>
        );
    }
  };
  const section = (id: Category) => {
    const selected = categories.find((item) => item.id === id)!;
    return (
      <Stack gap="lg" key={id}>
        <Stack gap="xs">
          <Heading level={2}>{selected.title}</Heading>
          <Text size="sm" tone="muted">
            {selected.description}
          </Text>
        </Stack>
        {content(id)}
      </Stack>
    );
  };
  const summaries: Record<Category, string> = {
    general: `Theme: ${theme === 'system' ? 'System' : theme === 'dark' ? 'Dark' : 'Light'}`,
    agent: stores.openai.snapshot().model ?? 'Model default',
    voice: `Voice: ${stores.openai.snapshot().voice ?? 'marin'}`,
    connections: '2 connections configured',
  };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Settings"
      description="Preferences for this device"
    >
      <Stack inset="page" block="md" gap="xl">
        {variant === 'cards' ? categories.map((item) => section(item.id)) : null}
        {variant === 'categories' ? (
          <Stack gap="xl">
            <Surface variant="subtle">
              <Row wrap={true}>
                {categories.map((item) => (
                  <Button
                    key={item.id}
                    variant={category === item.id ? 'filled' : 'ghost'}
                    size="compact"
                    aria-pressed={category === item.id}
                    onClick={() => setCategory(item.id)}
                  >
                    {item.title}
                  </Button>
                ))}
              </Row>
            </Surface>
            {section(category)}
          </Stack>
        ) : null}
        {variant === 'overview' ? (
          detail ? (
            <Stack gap="lg">
              <Row>
                <Button variant="ghost" size="compact" onClick={() => setDetail(null)}>
                  ← All settings
                </Button>
              </Row>
              {section(detail)}
            </Stack>
          ) : (
            <Stack gap="lg">
              <Stack gap="xs">
                <Heading level={2}>Your preferences</Heading>
                <Text size="sm" tone="muted">
                  Choose an area to view and adjust its settings.
                </Text>
              </Stack>
              {categories.map((item) => (
                <Container
                  key={item.id}
                  title={item.title}
                  description={item.description}
                  action={
                    <Button
                      variant="outline"
                      size="compact"
                      aria-label={`Edit ${item.title}`}
                      onClick={() => setDetail(item.id)}
                    >
                      Edit
                    </Button>
                  }
                >
                  <Text size="sm">{summaries[item.id]}</Text>
                </Container>
              ))}
            </Stack>
          )
        ) : null}
      </Stack>
    </Drawer>
  );
}

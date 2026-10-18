// Throwaway comparison: can containers and navigation make settings easier to scan?
// Three layouts share the same fictional, memory-only preferences.
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { ModuleSettings } from '@/application/settings/presentation.ts';
import { type SettingsDefinition, createSettings } from '@/application/settings/index.ts';
import { agentSettings } from '@/agent/settings.ts';
import { createOpenAISettings } from '@/agent/openai/settings.ts';
import { githubSettings } from '@/application/persistence/settings.ts';
import {
  Button,
  Drawer,
  Heading,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  FieldError,
  Row,
  Select,
  RadioGroup,
  RadioGroupItem,
  RadioGroupIndicator,
  TextBox,
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
        {variant === 'cards' ? (
          <RefinedCards stores={stores} chatDefinition={chatDefinition} />
        ) : null}
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

// Selected direction: a single card per subject, with direct choices and paired connection fields.
function RefinedCards({
  stores,
  chatDefinition,
}: {
  stores: {
    provider: SettingsDefinition;
    openai: ReturnType<typeof createSettings>;
    agent: ReturnType<typeof createSettings>;
    chat: ReturnType<typeof createSettings>;
  };
  chatDefinition: SettingsDefinition;
}) {
  const openai = useSyncExternalStore(stores.openai.subscribe, stores.openai.snapshot);
  const agent = useSyncExternalStore(stores.agent.subscribe, stores.agent.snapshot);
  const chat = useSyncExternalStore(stores.chat.subscribe, stores.chat.snapshot);
  const [theme, setTheme] = useState('system');
  const [customModel, setCustomModel] = useState(false);
  const [editInstructions, setEditInstructions] = useState(false);
  const [limits, setLimits] = useState(false);
  const [voiceModels, setVoiceModels] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const modelField = stores.provider.fields.find((field) => field.key === 'model')!;
  const models = modelField.choices ?? [];
  const modelNames = ['Thorough', 'Balanced', 'Quick'];
  const voices = stores.provider.fields.find((field) => field.key === 'voice')?.choices ?? [];
  const instructions = chat.instructions ?? '';
  const defaultInstructions = chatDefinition.fields.find(
    (field) => field.key === 'instructions',
  )?.defaultValue;
  const choose = (
    label: string,
    value: string,
    options: { value: string; label: string; detail?: string }[],
    onChange: (value: string) => void,
    presentation: 'segmented' | 'cards' | 'tiles' = 'cards',
  ) => (
    <RadioGroup
      aria-label={label}
      variant={presentation}
      value={value}
      onValueChange={(next) => {
        if (next !== null) onChange(next);
      }}
    >
      {options.map((option) => (
        <RadioGroupItem key={option.value} value={option.value}>
          <Stack gap="xs" align="start">
            <Text as="span" size="sm" weight="medium">
              {option.label}
            </Text>
            {option.detail ? (
              <Text as="span" size="xs" tone="muted">
                {option.detail}
              </Text>
            ) : null}
          </Stack>
          <RadioGroupIndicator>✓</RadioGroupIndicator>
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
  return (
    <Stack gap="xl">
      <Container title="Appearance">
        {choose(
          'Theme',
          theme,
          [
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
          setTheme,
          'segmented',
        )}
      </Container>
      <Stack gap="lg">
        <Heading level={2}>Agent</Heading>
        <Container
          title="Chat model"
          action={
            <Button
              variant="ghost"
              size="compact"
              aria-expanded={customModel}
              onClick={() => setCustomModel(!customModel)}
            >
              Custom model
            </Button>
          }
        >
          {choose(
            'Chat model',
            openai.model ?? '',
            models.map((model, index) => ({
              value: model.value,
              label: modelNames[index] ?? model.label,
              detail: model.label,
            })),
            (value) => {
              stores.openai.set('model', value);
              setCustomModel(false);
            },
          )}
          {customModel || !models.some((model) => model.value === openai.model) ? (
            <SettingField
              label="Model ID"
              description="Use a model available through your connection."
            >
              <Input
                value={openai.model ?? ''}
                onChange={(event) => stores.openai.set('model', event.currentTarget.value)}
              />
            </SettingField>
          ) : null}
        </Container>
        <Container
          title="Instructions"
          action={
            <Button
              variant="ghost"
              size="compact"
              aria-expanded={editInstructions}
              onClick={() => setEditInstructions(!editInstructions)}
            >
              {editInstructions ? 'Done' : 'Edit'}
            </Button>
          }
        >
          {editInstructions ? (
            <Stack gap="sm">
              <TextBox
                label="Agent instructions"
                layout="longform"
                description="Applies to new messages."
                draft={instructions}
                onDraftChange={(value) => stores.chat.set('instructions', value)}
              />
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => stores.chat.reset(['instructions'])}
                >
                  Restore default instructions
                </Button>
              </Row>
            </Stack>
          ) : (
            <Text size="sm" tone="muted" preserve={true}>
              {instructions === defaultInstructions
                ? 'Default instructions'
                : instructions || 'No custom instructions'}
            </Text>
          )}
        </Container>
        <Container
          title="Run limits"
          action={
            <Button
              variant="ghost"
              size="compact"
              aria-expanded={limits}
              onClick={() => setLimits(!limits)}
            >
              {limits ? 'Done' : 'Adjust'}
            </Button>
          }
        >
          {limits ? (
            <Stack gap="lg">
              <Row justify="between" wrap={true}>
                <Text size="sm">Maximum steps</Text>
                <Row>
                  <Button
                    variant="outline"
                    size="compact"
                    aria-label="Decrease maximum steps"
                    disabled={Number(agent.maxSteps) <= 1}
                    onClick={() =>
                      stores.agent.set('maxSteps', String(Math.max(1, Number(agent.maxSteps) - 1)))
                    }
                  >
                    −
                  </Button>
                  <Text size="sm" role="status" aria-label="Maximum steps">
                    {agent.maxSteps}
                  </Text>
                  <Button
                    variant="outline"
                    size="compact"
                    aria-label="Increase maximum steps"
                    onClick={() => stores.agent.set('maxSteps', String(Number(agent.maxSteps) + 1))}
                  >
                    +
                  </Button>
                </Row>
              </Row>
              <SettingField
                label="Output token limit"
                description="Leave blank for the model default."
              >
                <Input
                  inputMode="numeric"
                  value={agent.maxOutputTokens ?? ''}
                  placeholder="Model default"
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (!value || (/^\d+$/.test(value) && Number(value) > 0))
                      stores.agent.set('maxOutputTokens', value);
                  }}
                />
              </SettingField>
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => stores.agent.reset(['maxSteps', 'maxOutputTokens'])}
                >
                  Restore default limits
                </Button>
              </Row>
            </Stack>
          ) : (
            <Text size="sm" tone="muted">
              {agent.maxSteps} steps ·{' '}
              {agent.maxOutputTokens
                ? `${agent.maxOutputTokens} output tokens`
                : 'Model default output'}
            </Text>
          )}
        </Container>
      </Stack>
      <Stack gap="lg">
        <Heading level={2}>Voice & dictation</Heading>
        <Container title="Voice">
          {choose(
            'Voice',
            openai.voice ?? '',
            voices.map((voice) => ({ value: voice.value, label: voice.label })),
            (value) => stores.openai.set('voice', value),
            'tiles',
          )}
        </Container>
        <Container
          title="Voice models"
          action={
            <Button
              variant="ghost"
              size="compact"
              aria-expanded={voiceModels}
              onClick={() => setVoiceModels(!voiceModels)}
            >
              {voiceModels ? 'Done' : 'Change'}
            </Button>
          }
        >
          {voiceModels ? (
            <Stack gap="lg">
              {['voiceModel', 'liveTranscriptionModel', 'fileTranscriptionModel'].map((key) => {
                const field = stores.provider.fields.find((candidate) => candidate.key === key)!;
                return (
                  <SettingField key={key} label={field.label} description={field.description}>
                    <Input
                      value={openai[key] ?? ''}
                      onChange={(event) => stores.openai.set(key, event.currentTarget.value)}
                    />
                  </SettingField>
                );
              })}
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() =>
                    stores.openai.reset([
                      'voiceModel',
                      'liveTranscriptionModel',
                      'fileTranscriptionModel',
                    ])
                  }
                >
                  Restore default models
                </Button>
              </Row>
            </Stack>
          ) : (
            <Text size="sm" tone="muted" preserve={true}>
              {openai.voiceModel} · {openai.liveTranscriptionModel} ·{' '}
              {openai.fileTranscriptionModel}
            </Text>
          )}
        </Container>
      </Stack>
      <Stack gap="lg">
        <Heading level={2}>Connections</Heading>
        {['OpenAI', 'GitHub'].map((name) => (
          <Container key={name} title={name}>
            <EndpointField
              name={name}
              initial={
                name === 'OpenAI'
                  ? 'https://api.openai.com/v1'
                  : (githubSettings.fields.find((field) => field.key === 'api')?.defaultValue ?? '')
              }
            />
            <Stack gap="sm">
              <Row justify="between" wrap={true}>
                <Stack gap="xs">
                  <Text size="sm" weight="medium">
                    {name === 'OpenAI' ? 'API key' : 'Access token'}
                  </Text>
                  <Text size="sm" tone="muted" role="status">
                    {saved[name]
                      ? 'Custom value saved for preview'
                      : 'Configured · Using login value'}
                  </Text>
                </Stack>
                <Button
                  variant="outline"
                  size="compact"
                  aria-label={`Change ${name} credential`}
                  aria-expanded={editingKey === name}
                  onClick={() => setEditingKey(editingKey === name ? null : name)}
                >
                  {editingKey === name ? 'Cancel' : 'Change'}
                </Button>
              </Row>
              {editingKey === name ? (
                <Stack gap="sm">
                  <SettingField
                    label={`Replacement ${name} key`}
                    description="Credentials stay on this device."
                  >
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Paste a replacement key"
                      value={keys[name] ?? ''}
                      onChange={(event) => setKeys({ ...keys, [name]: event.currentTarget.value })}
                    />
                  </SettingField>
                  <Row>
                    <Button
                      variant="outline"
                      size="compact"
                      disabled={!keys[name]?.trim()}
                      onClick={() => {
                        setSaved({ ...saved, [name]: true });
                        setKeys({ ...keys, [name]: '' });
                        setEditingKey(null);
                      }}
                    >
                      Save key
                    </Button>
                  </Row>
                </Stack>
              ) : null}
            </Stack>
            {name === 'GitHub' ? (
              <InlineCopyField
                label="Vault repository"
                value={
                  githubSettings.fields.find((field) => field.key === 'repository')?.defaultValue ??
                  ''
                }
              />
            ) : null}
          </Container>
        ))}
        <SettingsDisclosure title="Troubleshooting">
          <ModuleSettings definition={agentSettings} store={stores.agent} keys={['maxRetries']} />
        </SettingsDisclosure>
      </Stack>
    </Stack>
  );
}

function InlineCopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <SettingField label={label} description="">
      <InputGroup>
        <InputGroupInput readOnly={true} value={value} />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            aria-label={`Copy ${label}`}
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </SettingField>
  );
}

function EndpointField({ name, initial }: { name: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [accepted, setAccepted] = useState(initial);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const changed = value !== accepted;
  return (
    <Stack gap="sm">
      <SettingField label="API endpoint" description="">
        <InputGroup>
          <InputGroupInput
            aria-label={`${name} API endpoint`}
            type="url"
            autoComplete="url"
            spellCheck={false}
            value={value}
            aria-invalid={!!error || undefined}
            onChange={(event) => {
              setValue(event.currentTarget.value);
              setError('');
              setCopied(false);
              setSaved(false);
            }}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              aria-label={`Copy ${name} API endpoint`}
              onClick={async () => {
                await navigator.clipboard.writeText(value);
                setCopied(true);
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </SettingField>
      {changed ? (
        <Row wrap={true}>
          <Button
            size="compact"
            onClick={() => {
              try {
                const url = new URL(value.trim());
                if (
                  !['https:', 'http:'].includes(url.protocol) ||
                  url.username ||
                  url.password ||
                  url.search ||
                  url.hash
                )
                  throw new Error();
                const endpoint = value.trim().replace(/\/+$/, '');
                setAccepted(endpoint);
                setValue(endpoint);
                setSaved(true);
              } catch {
                setError(
                  'Enter an HTTP or HTTPS API URL without credentials, query parameters or a fragment.',
                );
              }
            }}
          >
            Save endpoint
          </Button>
          <Button
            variant="ghost"
            size="compact"
            onClick={() => {
              setValue(accepted);
              setError('');
            }}
          >
            Cancel
          </Button>
        </Row>
      ) : null}
      {error ? <FieldError>{error}</FieldError> : null}
      {saved ? (
        <Text size="sm" tone="muted" role="status">
          Endpoint saved for this preview
        </Text>
      ) : null}
    </Stack>
  );
}

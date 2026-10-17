import { useState, useSyncExternalStore } from 'react';
import type { SettingsDefinition, SettingsStore } from '@/settings/store.ts';
import { agentSettings } from '@/agent/settings.ts';
import { githubSettings } from '@/vault/storage/settings.ts';
import { supportsOpenAISampling } from '@/agent/openai/settings.ts';
import { apiEndpoint } from '@/settings/endpoint.ts';
import { ModuleSettings } from '@/settings/ModuleSettings.tsx';
import { CredentialSetting } from '@/vault/session/ui.tsx';
import type { SessionCredentials } from '@/vault/session/credentials.ts';
import {
  Button,
  FieldError,
  Heading,
  Input,
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
  Row,
  RadioGroup,
  RadioGroupItem,
  RadioGroupIndicator,
  SettingField,
  SettingsDisclosure,
  Stack,
  Text,
  TextBox,
  SettingsCard,
  ThemeSwitch,
  Drawer,
} from '@/ui/kit/index.ts';
// Selected direction: a single card per subject, with direct choices and paired connection fields.
export function SettingsCards({
  stores,
  chatDefinition,
  credentials,
  githubEndpoint,
  saveGitHubEndpoint,
  variant = 'cards',
}: {
  stores: {
    provider: SettingsDefinition;
    openai: SettingsStore;
    agent: SettingsStore;
    chat: SettingsStore;
  };
  chatDefinition: SettingsDefinition;
  credentials: SessionCredentials;
  githubEndpoint: string;
  saveGitHubEndpoint: (value: string) => Promise<void>;
  variant?: 'cards' | 'compact';
}) {
  const openai = useSyncExternalStore(stores.openai.subscribe, stores.openai.snapshot);
  const agent = useSyncExternalStore(stores.agent.subscribe, stores.agent.snapshot);
  const chat = useSyncExternalStore(stores.chat.subscribe, stores.chat.snapshot);
  const [customModel, setCustomModel] = useState(false);
  const [editInstructions, setEditInstructions] = useState(false);
  const [limits, setLimits] = useState(false);
  const [voiceModels, setVoiceModels] = useState(false);
  const [editingKeys, setEditingKeys] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState('');
  const guarded = (store: SettingsStore): SettingsStore => ({
    ...store,
    set: (key, value) => {
      try {
        store.set(key, value);
        setSaveError('');
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Settings could not be saved.');
      }
    },
    reset: (keys) => {
      try {
        store.reset(keys);
        setSaveError('');
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : 'Settings could not be saved.');
      }
    },
  });
  const preferences = {
    openai: guarded(stores.openai),
    agent: guarded(stores.agent),
    chat: guarded(stores.chat),
  };
  const modelField = stores.provider.fields.find((field) => field.key === 'model')!;
  const models = (modelField.choices ?? []).filter((choice) =>
    ['gpt-6-astra', 'gpt-6.1-sol', 'gpt-6-luna'].includes(choice.value),
  );
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
          <RadioGroupIndicator aria-hidden="true">✓</RadioGroupIndicator>
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
  return (
    <Stack gap={variant === 'compact' ? 'lg' : 'xl'}>
      {saveError ? <FieldError>{saveError}</FieldError> : null}
      <SettingsCard title="Appearance">
        <ThemeSwitch />
      </SettingsCard>
      <Stack gap="lg">
        <Heading level={2}>Agent</Heading>
        <SettingsCard
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
              preferences.openai.set('model', value);
              setCustomModel(false);
            },
          )}
          {customModel || !models.some((model) => model.value === openai.model) ? (
            <SettingField
              label="Custom chat model"
              description="Use a model available through your connection."
            >
              <Input
                value={openai.model ?? ''}
                onChange={(event) => preferences.openai.set('model', event.currentTarget.value)}
              />
            </SettingField>
          ) : null}
        </SettingsCard>
        <SettingsCard
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
                label="Instructions"
                layout="longform"
                description="Applies to new messages."
                draft={instructions}
                onDraftChange={(value) => preferences.chat.set('instructions', value)}
              />
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => preferences.chat.reset(['instructions'])}
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
        </SettingsCard>
        <SettingsCard
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
              <ModuleSettings
                definition={agentSettings}
                store={stores.agent}
                keys={['maxSteps', 'maxOutputTokens']}
                reset={false}
              />
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() => preferences.agent.reset(['maxSteps', 'maxOutputTokens'])}
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
        </SettingsCard>
        {supportsOpenAISampling(openai.model ?? '') ? (
          <SettingsDisclosure title="Advanced model tuning">
            <ModuleSettings
              definition={agentSettings}
              store={stores.agent}
              keys={['temperature', 'topP']}
            />
          </SettingsDisclosure>
        ) : null}
      </Stack>
      <Stack gap="lg">
        <Heading level={2}>Voice & dictation</Heading>
        <SettingsCard title="Voice">
          {choose(
            'Voice',
            openai.voice ?? '',
            voices.map((voice) => ({ value: voice.value, label: voice.label })),
            (value) => preferences.openai.set('voice', value),
            'tiles',
          )}
        </SettingsCard>
        <SettingsCard
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
              <ModuleSettings
                definition={stores.provider}
                store={stores.openai}
                keys={['voiceModel', 'liveTranscriptionModel', 'fileTranscriptionModel']}
                reset={false}
              />
              <Row>
                <Button
                  variant="ghost"
                  size="compact"
                  onClick={() =>
                    preferences.openai.reset([
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
        </SettingsCard>
      </Stack>
      <Stack gap="lg">
        <Heading level={2}>Connections</Heading>
        {['OpenAI', 'GitHub'].map((name) => (
          <SettingsCard key={name} title={name}>
            <EndpointField
              name={name}
              disabledReason={
                credentials[name === 'OpenAI' ? 'openai' : 'github'].disabledReason?.includes(
                  'activity',
                ) ||
                credentials[name === 'OpenAI' ? 'openai' : 'github'].disabledReason?.includes(
                  'being updated',
                )
                  ? credentials[name === 'OpenAI' ? 'openai' : 'github'].disabledReason
                  : undefined
              }
              value={name === 'OpenAI' ? (openai.api ?? '') : githubEndpoint}
              onSave={
                name === 'OpenAI'
                  ? async (value) => stores.openai.set('api', value)
                  : saveGitHubEndpoint
              }
            />
            <Stack gap="sm">
              <Row justify="between" wrap={true}>
                <Stack gap="xs">
                  <Text size="sm" weight="medium">
                    {name === 'OpenAI' ? 'API key' : 'Access token'}
                  </Text>
                  <Text size="sm" tone="muted" role="status">
                    {credentials[name === 'OpenAI' ? 'openai' : 'github'].configured
                      ? credentials[name === 'OpenAI' ? 'openai' : 'github'].overridden
                        ? 'Custom value'
                        : 'Configured · Using login value'
                      : 'Not configured'}
                  </Text>
                </Stack>
                <Button
                  variant="outline"
                  size="compact"
                  aria-label={`Change ${name} credential`}
                  aria-expanded={editingKeys[name]}
                  onClick={() => setEditingKeys({ ...editingKeys, [name]: !editingKeys[name] })}
                >
                  {editingKeys[name] ? 'Cancel' : 'Change'}
                </Button>
              </Row>
              {editingKeys[name] ? (
                <CredentialSetting
                  credential={credentials[name === 'OpenAI' ? 'openai' : 'github']}
                  field={{
                    label: name === 'OpenAI' ? 'OpenAI API key' : 'GitHub token',
                    description: 'Used with the API endpoint above.',
                  }}
                />
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
          </SettingsCard>
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

function EndpointField({
  name,
  value: accepted,
  onSave,
  disabledReason,
}: {
  name: string;
  value: string;
  onSave: (value: string) => Promise<void>;
  disabledReason?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? accepted;
  const setValue = setDraft;
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const changed = value !== accepted;
  return (
    <Stack gap="sm">
      <SettingField label="API endpoint" description="">
        <InputGroup>
          <InputGroupInput
            aria-label={`${name} API endpoint`}
            type="url"
            disabled={pending || !!disabledReason}
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
            disabled={pending || !!disabledReason}
            onClick={async () => {
              setPending(true);
              try {
                const endpoint = apiEndpoint(value);
                await onSave(endpoint);
                setDraft(null);
                setSaved(true);
              } catch (error) {
                setError(
                  error instanceof Error && error.message
                    ? error.message
                    : 'Enter an HTTP or HTTPS API URL without credentials, query parameters or a fragment.',
                );
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Saving endpoint…' : 'Save endpoint'}
          </Button>
          <Button
            variant="ghost"
            size="compact"
            disabled={pending}
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
          Endpoint saved on this device
        </Text>
      ) : null}
    </Stack>
  );
}

export function GroupedSettingsMenu({
  open,
  onClose,
  ...props
}: Parameters<typeof SettingsCards>[0] & { open: boolean; onClose: () => void }) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Settings"
      description="Preferences for this device"
    >
      <Stack inset="page" block="md">
        <SettingsCards {...props} />
      </Stack>
    </Drawer>
  );
}

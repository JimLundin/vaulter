// Module definitions supply meaning and persistence; this renderer shares field behavior.
import { type ChangeEvent, useCallback, useId, useState, useSyncExternalStore } from 'react';
import type { SettingDefinition, SettingsDefinition, SettingsStore } from '../settings.ts';
import {
  Button,
  FieldError,
  Input,
  Row,
  SettingField,
  Stack,
  Text,
  Textarea,
} from './kit/index.ts';

function SettingControl({
  field,
  value,
  store,
}: {
  field: SettingDefinition;
  value: string;
  store: SettingsStore;
}) {
  const errorId = useId();
  const [draft, setDraft] = useState<{ value: string; error?: string; previous: string } | null>(
    null,
  );
  const currentDraft = draft && draft.previous === value ? draft : null;
  const update = (next: string) => {
    try {
      store.set(field.key, next);
      setDraft({
        value: next,
        previous: store.snapshot()[field.key] ?? field.defaultValue ?? '',
      });
    } catch (error) {
      setDraft({
        value: next,
        error: error instanceof Error ? error.message : 'Enter a valid value.',
        previous: value,
      });
    }
  };
  const props = {
    value: currentDraft?.value ?? value,
    placeholder: field.placeholder ?? field.defaultValue,
    readOnly: field.kind === 'readonly',
    'aria-invalid': currentDraft?.error ? true : undefined,
    'aria-describedby': currentDraft?.error ? errorId : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (field.kind !== 'readonly') update(event.currentTarget.value);
    },
  };
  return (
    <SettingField label={field.label} description={field.description}>
      {field.kind === 'multiline' ? (
        <Textarea {...props} />
      ) : (
        <Input {...props} inputMode={field.kind === 'number' ? 'decimal' : undefined} />
      )}
      {currentDraft?.error ? <FieldError id={errorId}>{currentDraft.error}</FieldError> : null}
    </SettingField>
  );
}

export function ModuleSettings({
  definition,
  store,
}: {
  definition: SettingsDefinition;
  store: SettingsStore;
}) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => store.snapshot(), [store]);
  const values = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [resetVersion, setResetVersion] = useState(0);
  const [resetError, setResetError] = useState('');
  const fields = definition.fields.filter((field) => field.kind !== 'secret');
  return (
    <Stack gap="lg">
      {fields.map((field) => (
        <SettingControl
          key={`${field.key}:${resetVersion}`}
          field={field}
          value={values[field.key] ?? field.defaultValue ?? ''}
          store={store}
        />
      ))}
      {fields.some((field) => field.kind !== 'readonly') && (
        <Row>
          <Button
            variant="outline"
            size="compact"
            aria-label={`Reset ${definition.name} to defaults`}
            onClick={() => {
              try {
                store.reset();
                setResetVersion((version) => version + 1);
                setResetError('');
              } catch (error) {
                setResetError(
                  error instanceof Error ? error.message : 'Settings could not be reset.',
                );
              }
            }}
          >
            Reset to defaults
          </Button>
        </Row>
      )}
      {resetError ? <FieldError>{resetError}</FieldError> : null}
    </Stack>
  );
}

interface SecretSettingsProps {
  definition: SettingsDefinition;
  configured: Readonly<Record<string, boolean>>;
  overridden: Readonly<Record<string, boolean>>;
  onChange: (key: string, value: string | null | undefined) => Promise<void>;
  disabledReason?: string;
  persistent?: boolean;
}

function SecretControl({
  field,
  configured,
  overridden,
  onChange,
  disabledReason,
}: {
  field: SettingDefinition;
  configured: boolean;
  overridden: boolean;
  onChange: SecretSettingsProps['onChange'];
  disabledReason?: string;
}) {
  const statusId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const disabled = Boolean(disabledReason) || pending;
  const change = async (next: string | null | undefined, success: string) => {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await onChange(field.key, next);
      setValue('');
      setMessage(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The credential could not be saved.');
    } finally {
      setPending(false);
    }
  };
  const status = configured
    ? overridden
      ? 'Custom value'
      : 'Using login value'
    : 'Not configured';
  return (
    <SettingField
      label={field.label}
      description={`${field.description}${disabledReason ? ` ${disabledReason}` : ''}`}
    >
      <Input
        type="password"
        autoComplete="new-password"
        value={value}
        placeholder={configured ? 'Configured' : 'Not configured'}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={`${statusId}${error ? ` ${errorId}` : ''}`}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setError('');
          setMessage('');
        }}
      />
      <Text id={statusId} size="sm" tone="muted" role="status">
        {pending ? 'Saving…' : message || status}
      </Text>
      <Row wrap={true}>
        <Button
          variant="outline"
          size="compact"
          disabled={disabled || !value.trim()}
          aria-label={`Save ${field.label}`}
          onClick={() => {
            change(value.trim(), 'Saved').catch(() => undefined);
          }}
        >
          Save key
        </Button>
        {overridden ? (
          <Button
            variant="ghost"
            size="compact"
            disabled={disabled}
            aria-label={`Restore login value for ${field.label}`}
            onClick={() => {
              change(undefined, 'Restored login value').catch(() => undefined);
            }}
          >
            Restore login value
          </Button>
        ) : null}
        {field.clearable !== false && (
          <Button
            variant="ghost"
            size="compact"
            disabled={disabled || !configured}
            aria-label={`Clear ${field.label}`}
            onClick={() => {
              change(null, 'Cleared').catch(() => undefined);
            }}
          >
            Clear key
          </Button>
        )}
      </Row>
      {error ? <FieldError id={errorId}>{error}</FieldError> : null}
    </SettingField>
  );
}

export function SecretSettings({ persistent = true, ...props }: SecretSettingsProps) {
  return (
    <Stack gap="lg">
      <Text size="sm" tone="muted">
        {persistent
          ? 'Credential changes are encrypted on this device.'
          : 'Credential changes last for this session.'}
      </Text>
      {props.definition.fields
        .filter((field) => field.kind === 'secret')
        .map((field) => (
          <SecretControl
            key={field.key}
            field={field}
            configured={props.configured[field.key] ?? false}
            overridden={props.overridden[field.key] ?? false}
            onChange={props.onChange}
            disabledReason={props.disabledReason}
          />
        ))}
    </Stack>
  );
}

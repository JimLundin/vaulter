// Module definitions supply meaning and persistence; this renderer shares field behavior.
import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
} from 'react';
import type { SettingDefinition, SettingsDefinition, SettingsStore } from './store.ts';
import {
  Button,
  FieldError,
  Input,
  Row,
  Select,
  SettingField,
  SettingsDisclosure,
  Stack,
  TextBox,
} from '@/ui/kit/index.ts';

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
  const [customSelection, setCustomSelection] = useState<string | null>(null);
  useEffect(() => {
    setDraft((current) => (current && current.previous !== value ? null : current));
    setCustomSelection((current) => (current !== value ? null : current));
  }, [value]);
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
  if (field.choices) {
    const displayedValue = currentDraft?.value ?? value;
    const listed = field.choices.some((choice) => choice.value === displayedValue);
    const custom = field.allowCustom && (customSelection === value || !listed);
    let customValue = '__custom__';
    while (field.choices.some((choice) => choice.value === customValue)) customValue += '_';
    const choices = [
      ...field.choices,
      ...(!(listed || field.allowCustom) ? [{ value: displayedValue, label: displayedValue }] : []),
      ...(field.allowCustom ? [{ value: customValue, label: 'Custom…' }] : []),
    ];
    return (
      <Stack gap="sm">
        <SettingField label={field.label} description={field.description}>
          <Select
            options={choices}
            value={custom ? customValue : displayedValue}
            disabled={field.kind === 'readonly'}
            aria-invalid={!custom && currentDraft?.error ? true : undefined}
            aria-describedby={!custom && currentDraft?.error ? errorId : undefined}
            onChange={(event) => {
              const next = event.currentTarget.value;
              if (field.allowCustom && next === customValue) {
                setCustomSelection(value);
                setDraft({ value: listed ? '' : displayedValue, previous: value });
              } else {
                setCustomSelection(null);
                update(next);
              }
            }}
          />
          {!custom && currentDraft?.error ? (
            <FieldError id={errorId}>{currentDraft.error}</FieldError>
          ) : null}
        </SettingField>
        {custom ? (
          <SettingField
            label={`Custom ${field.label.toLowerCase()}`}
            description="Enter a value that is not listed. Leave blank to keep the current selection."
          >
            <Input
              {...props}
              placeholder={field.placeholder}
              inputMode={field.kind === 'number' ? 'decimal' : undefined}
              onChange={(event) => {
                const next = event.currentTarget.value;
                if (next.trim()) update(next);
                else setDraft({ value: next, previous: value });
                setCustomSelection(store.snapshot()[field.key] ?? value);
              }}
            />
            {currentDraft?.error ? (
              <FieldError id={errorId}>{currentDraft.error}</FieldError>
            ) : null}
          </SettingField>
        ) : null}
      </Stack>
    );
  }
  if (field.kind === 'multiline') {
    return (
      <TextBox
        label={field.label}
        layout="longform"
        description={field.description}
        placeholder={field.placeholder ?? field.defaultValue}
        draft={currentDraft?.value ?? value}
        onDraftChange={update}
        error={currentDraft?.error}
      />
    );
  }
  return (
    <SettingField label={field.label} description={field.description}>
      <Input {...props} inputMode={field.kind === 'number' ? 'decimal' : undefined} />
      {currentDraft?.error ? <FieldError id={errorId}>{currentDraft.error}</FieldError> : null}
    </SettingField>
  );
}

export function ModuleSettings({
  definition,
  store,
  keys,
  disclosure,
  reset = true,
}: {
  definition: SettingsDefinition;
  store: SettingsStore;
  keys?: readonly string[];
  disclosure?: string;
  reset?: boolean;
}) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => store.snapshot(), [store]);
  const values = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [resetVersion, setResetVersion] = useState(0);
  const [resetError, setResetError] = useState('');
  const fields = definition.fields.filter(
    (field) => field.kind !== 'secret' && (!keys || keys.includes(field.key)),
  );
  const customized = fields.filter(
    (field) => field.kind !== 'readonly' && values[field.key] !== (field.defaultValue ?? ''),
  ).length;
  const content = (
    <Stack gap="lg">
      {fields.map((field) => (
        <SettingControl
          key={`${field.key}:${resetVersion}`}
          field={field}
          value={values[field.key] ?? field.defaultValue ?? ''}
          store={store}
        />
      ))}
      {reset && fields.some((field) => field.kind !== 'readonly') && (
        <Row>
          <Button
            variant="outline"
            size="compact"
            aria-label={`Reset ${disclosure ?? definition.name} to defaults`}
            onClick={() => {
              try {
                store.reset(keys);
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
  return disclosure ? (
    <SettingsDisclosure
      title={disclosure}
      summary={customized ? `${customized} customized` : 'Default'}
    >
      {content}
    </SettingsDisclosure>
  ) : (
    content
  );
}

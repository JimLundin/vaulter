import { type SubmitEvent, useId, useRef, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Brand,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  FieldError,
  DropdownMenuItem,
  Form,
  Gate,
  Icon,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Label,
  Row,
  SettingField,
  Stack,
  Text,
} from '@/ui/kit/index.ts';
import type { SettingDefinition } from '@/application/settings/store.ts';
import type { Credential } from './credentials.ts';
import type { Session, Status } from './session.ts';
import { REMEMBER_DAYS } from './unlock.ts';

/** The Session owns password interaction and remembered-login meaning. */
export function Unlock({ unlock }: NonNullable<Session['locked']>) {
  const [password, setPassword] = useState('');
  const id = useId();
  const [busy, setBusy] = useState(false);
  const submitting = useRef<boolean>(false);
  const [wrong, setWrong] = useState(false);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setWrong(false);
    try {
      await unlock(password);
    } catch {
      setWrong(true);
      setBusy(false);
      submitting.current = false;
    }
  };
  return (
    <Gate>
      <Brand />
      <Card>
        <CardHeader>
          <CardDescription>
            Open your vault. This device remembers it for {REMEMBER_DAYS} days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form onSubmit={submit}>
            <Stack>
              <Label htmlFor={id}>Password</Label>
              <InputGroup>
                <InputGroupInput
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  autoFocus={true}
                  value={password}
                  disabled={busy}
                  onChange={(event) => setPassword(event.currentTarget.value)}
                />
                <InputGroupAddon align="inset-end">
                  <InputGroupButton
                    variant="filled"
                    type="submit"
                    size="standard"
                    iconOnly={true}
                    aria-label={busy ? 'Opening vault' : 'Open vault'}
                    disabled={busy || !password}
                    pending={busy}
                  >
                    <Icon name="enter" />
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              {!!wrong && (
                <Alert variant="destructive">
                  <AlertDescription>That isn't the password.</AlertDescription>
                </Alert>
              )}
            </Stack>
          </Form>
        </CardContent>
      </Card>
    </Gate>
  );
}

/** Provider modules supply their field meaning; the Session owns credential tasks and provenance. */
export function CredentialSetting({
  credential,
  field,
}: {
  credential: Credential;
  field: Pick<SettingDefinition, 'label' | 'description'>;
}) {
  const statusId = useId();
  const errorId = useId();
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const saving = useRef<boolean>(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const disabled = Boolean(credential.disabledReason) || pending;
  const change = async (action: () => Promise<void>, success: string) => {
    if (disabled || saving.current) return;
    saving.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await action();
      setValue('');
      setMessage(success);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The credential could not be saved.');
    } finally {
      setPending(false);
      saving.current = false;
    }
  };
  const status = credential.configured
    ? credential.overridden
      ? 'Custom value'
      : 'Using login value'
    : 'Not configured';
  return (
    <Stack gap="lg">
      <Text size="sm" tone="muted">
        {credential.persistent
          ? 'Credential changes are encrypted on this device.'
          : 'Credential changes last for this session.'}
      </Text>
      <SettingField
        label={field.label}
        description={`${field.description}${credential.disabledReason ? ` ${credential.disabledReason}` : ''}`}
      >
        <Input
          type="password"
          autoComplete="new-password"
          value={value}
          placeholder={credential.configured ? 'Configured' : 'Not configured'}
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
            onClick={() => change(() => credential.save(value), 'Saved')}
          >
            Save key
          </Button>
          {credential.overridden ? (
            <Button
              variant="ghost"
              size="compact"
              disabled={disabled}
              aria-label={`Restore login value for ${field.label}`}
              onClick={() => change(credential.restore, 'Restored login value')}
            >
              Restore login value
            </Button>
          ) : null}
          {!!credential.clear && (
            <Button
              variant="ghost"
              size="compact"
              disabled={disabled || !credential.configured}
              aria-label={`Clear ${field.label}`}
              onClick={() => change(credential.clear!, 'Cleared')}
            >
              Clear key
            </Button>
          )}
        </Row>
        {error ? <FieldError id={errorId}>{error}</FieldError> : null}
      </SettingField>
    </Stack>
  );
}

export function SessionStatus({ status }: { status: Status }) {
  const label =
    status.kind === 'synced'
      ? new Date(status.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
      : status.kind === 'error'
        ? status.message
        : status.kind === 'offline'
          ? 'Offline'
          : 'Syncing…';
  return (
    <Text
      role="status"
      aria-label={status.kind === 'synced' ? `Synced at ${label}` : undefined}
      title={status.kind === 'synced' ? `Synced at ${label}` : label}
      size="xs"
      tone={['error', 'offline'].includes(status.kind) ? 'danger' : 'subtle'}
    >
      {label}
    </Text>
  );
}

export function RefreshVault({ status, refresh }: { status: Status; refresh: Session['refresh'] }) {
  const [pending, setPending] = useState(false);
  const refreshing = useRef<boolean>(false);
  const [error, setError] = useState('');
  const run = async () => {
    if (refreshing.current || status.kind === 'syncing') return;
    refreshing.current = true;
    setPending(true);
    setError('');
    try {
      await refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'The vault could not refresh.');
    } finally {
      setPending(false);
      refreshing.current = false;
    }
  };
  return (
    <Stack>
      <Row>
        <Button onClick={run} disabled={pending || status.kind === 'syncing'}>
          Refresh vault
        </Button>
        <SessionStatus status={status} />
      </Row>
      {!!error && <FieldError>{error}</FieldError>}
    </Stack>
  );
}

/** Application may supply its cross-module teardown; Session owns the sign-out task presentation. */
export function SignOut({
  onSignOut,
  menu = false,
}: {
  onSignOut: NonNullable<Session['signOut']>;
  menu?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const signingOut = useRef<boolean>(false);
  const [error, setError] = useState('');
  const run = async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setError('');
    try {
      await onSignOut();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Sign-out could not finish.');
      setPending(false);
      signingOut.current = false;
    }
  };
  const control = menu ? (
    <DropdownMenuItem
      aria-label="Sign out"
      title="Sign out"
      closeOnClick={false}
      onClick={run}
      disabled={pending}
      render={<Button variant="ghost" size="standard" iconOnly={true} />}
    >
      <Icon name="logout" />
    </DropdownMenuItem>
  ) : (
    <Button
      variant="ghost"
      size="standard"
      iconOnly={true}
      aria-label="Sign out"
      title="Sign out"
      onClick={run}
      disabled={pending}
    >
      <Icon name="logout" />
    </Button>
  );
  return (
    <Stack>
      {control}
      {!!error && <FieldError>{error}</FieldError>}
    </Stack>
  );
}

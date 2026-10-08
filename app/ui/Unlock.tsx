import { type SubmitEvent, useId, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Brand,
  Icon,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  Form,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Gate,
  Label,
  Stack,
} from './kit/index.ts';

export function Unlock({ unlock }: { unlock: (password: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setWrong(false);
    try {
      await unlock(pw);
    } catch {
      setWrong(true);
      setBusy(false);
    }
  };
  return (
    <Gate>
      <Brand />
      <Card>
        <CardHeader>
          <CardDescription>Open your vault. This device remembers it for 30 days.</CardDescription>
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
                  value={pw}
                  disabled={busy}
                  onChange={(event) => setPw(event.currentTarget.value)}
                />
                <InputGroupAddon align="inset-end">
                  <InputGroupButton
                    variant="default"
                    type="submit"
                    size="icon-sm"
                    aria-label={busy ? 'Opening vault' : 'Open vault'}
                    disabled={busy || !pw}
                    pending={busy}
                  >
                    <Icon name="chevron-right" />
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

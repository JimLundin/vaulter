import { type SubmitEvent, useId, useState } from 'react';
import {
  Alert,
  AlertDescription,
  Brand,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Gate,
  Input,
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
          <form onSubmit={submit}>
            <Stack>
              <Label htmlFor={id}>Password</Label>
              <Input
                id={id}
                type="password"
                autoComplete="current-password"
                autoFocus={true}
                value={pw}
                disabled={busy}
                onChange={(event) => setPw(event.currentTarget.value)}
              />
              {!!wrong && (
                <Alert variant="destructive">
                  <AlertDescription>That isn't the password.</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={busy || !pw}>
                {busy ? 'Opening…' : 'Open vault'}
              </Button>
            </Stack>
          </form>
        </CardContent>
      </Card>
    </Gate>
  );
}

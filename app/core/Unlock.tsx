// The password, once per device per 30 days (unlock.ts).
import { type ReactNode, type SubmitEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { Input } from '@/components/ui/input.tsx';
import { Label } from '@/components/ui/label.tsx';
import { ErrorState } from '@/components/layout.tsx';

/** The card the password screen is drawn in. */
function Gate({
  children,
  footer,
  error,
}: {
  children: ReactNode;
  footer: ReactNode;
  error?: string;
}) {
  return (
    <Card className="mx-auto mt-[14vh] max-w-sm bg-background shadow-pop">
      <CardHeader>
        <CardTitle className="text-2xl">Vault</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {children}
        {!!error && <ErrorState>{error}</ErrorState>}
      </CardContent>
      <CardFooter>
        <CardDescription>{footer}</CardDescription>
      </CardFooter>
    </Card>
  );
}

export function Unlock({ unlock }: { unlock: (password: string) => Promise<void> }) {
  const [pw, setPw] = useState('');
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [wrong, setWrong] = useState(false);
  const submit = async (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
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
    <Gate
      footer="This device remembers it for 30 days."
      error={wrong ? "That isn't the password." : ''}
    >
      <form className="grid gap-3" onSubmit={submit}>
        <Label htmlFor={id}>Password</Label>
        <Input
          id={id}
          type="password"
          autoComplete="current-password"
          autoFocus={true}
          value={pw}
          disabled={busy}
          onChange={(e) => setPw(e.currentTarget.value)}
        />
        <Button type="submit" disabled={busy || !pw}>
          {busy ? 'Opening…' : 'Open'}
        </Button>
      </form>
    </Gate>
  );
}

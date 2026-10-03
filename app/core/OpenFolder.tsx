// The vault folder on this device (backends/folder.ts): picked once, reopened with a click. Gate is the
// card both it and the password screen (Unlock.tsx) are drawn in.
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card.tsx';
import { ErrorState } from '@/components/layout.tsx';

export function Gate({
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

export function OpenFolder({
  saved,
  open,
}: {
  saved: string | null;
  open: (pick: boolean) => Promise<void>;
}) {
  const [error, setError] = useState('');
  const go = (pick: boolean) =>
    open(pick).catch((e) => {
      if (e.name !== 'AbortError') setError(e.message);
    });
  return (
    <Gate
      error={error}
      footer="The vault's root on this device: notes are read and written there. Chromium browsers only."
    >
      {!!saved && <Button onClick={() => go(false)}>Reopen {saved}</Button>}
      <Button variant={saved ? 'outline' : 'default'} onClick={() => go(!!saved)}>
        {saved ? 'Open another folder' : 'Open the vault folder'}
      </Button>
    </Gate>
  );
}

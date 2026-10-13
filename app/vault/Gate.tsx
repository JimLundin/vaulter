import type { ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  Brand,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  Gate,
  Heading,
  Loader,
} from '../ui/kit/index.ts';
import type { VaultFile } from './files.ts';
import type { Session } from './session/session.ts';
import { Unlock } from './session/ui.tsx';

/** Vault-owned readiness includes file/schema blocking as well as Session unlock state. */
export function VaultGate({
  state,
  children,
}: {
  state: Pick<Session, 'locked' | 'status'> & { files: VaultFile[] | null; blocked: string | null };
  children: ReactNode;
}) {
  if (state.locked) return <Unlock unlock={state.locked.unlock} />;
  if (state.files && !state.blocked) return children;
  return (
    <Gate>
      <Brand />
      {state.blocked || state.status.kind === 'error' ? (
        <Alert variant="destructive">
          <AlertDescription>
            {state.blocked ?? (state.status.kind === 'error' ? state.status.message : '')}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <Heading level={1}>Opening your vault</Heading>
            <CardDescription>Getting your conversations and notes ready.</CardDescription>
          </CardHeader>
          <CardContent>
            <Loader>Loading your vault…</Loader>
          </CardContent>
        </Card>
      )}
    </Gate>
  );
}

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
} from '@/shared/ui/kit/index.ts';
import type { Session } from '@/core/session/session.ts';
import { Unlock } from './ui.tsx';

/** Vault readiness follows accepted accepted EAV data and Session unlock state. */
export function VaultGate({
  state,
  children,
}: {
  state: Pick<Session, 'locked' | 'status' | 'ready'>;
  children: ReactNode;
}) {
  if (state.locked) return <Unlock unlock={state.locked.unlock} />;
  if (state.ready) return children;
  return (
    <Gate>
      <Brand />
      {state.status.kind === 'error' || state.status.kind === 'offline' ? (
        <Alert variant="destructive">
          <AlertDescription>
            {state.status.kind === 'error'
              ? state.status.message
              : 'Connect to load your vault on this device.'}
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

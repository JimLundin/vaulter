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
} from '@/ui/kit/index.ts';
import type { Session } from './session/session.ts';
import { Unlock } from './session/ui.tsx';

/** Vault readiness follows accepted node data and Session unlock state. */
export function VaultGate({
  state,
  children,
}: {
  state: Pick<Session, 'locked' | 'nodeStatus' | 'ready'>;
  children: ReactNode;
}) {
  if (state.locked) return <Unlock unlock={state.locked.unlock} />;
  if (state.ready) return children;
  return (
    <Gate>
      <Brand />
      {state.nodeStatus.kind === 'error' || state.nodeStatus.kind === 'offline' ? (
        <Alert variant="destructive">
          <AlertDescription>
            {state.nodeStatus.kind === 'error'
              ? state.nodeStatus.message
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

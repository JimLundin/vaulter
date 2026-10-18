import { ModuleSettings } from '@/settings/ModuleSettings.tsx';
import { Stack } from '@/ui/kit/index.ts';
import { agentPreferences, agentSettings } from './settings.ts';

export function AgentSettings({ sampling = false }: { sampling?: boolean }) {
  return (
    <Stack gap="lg">
      <ModuleSettings
        definition={agentSettings}
        store={agentPreferences}
        keys={['maxSteps', 'maxOutputTokens']}
        disclosure="Run limits"
      />
      {sampling ? (
        <ModuleSettings
          definition={agentSettings}
          store={agentPreferences}
          keys={['temperature', 'topP']}
          disclosure="Advanced model tuning"
        />
      ) : null}
    </Stack>
  );
}
export function AgentTroubleshooting() {
  return (
    <ModuleSettings
      definition={agentSettings}
      store={agentPreferences}
      keys={['maxRetries']}
      disclosure="Troubleshooting"
    />
  );
}

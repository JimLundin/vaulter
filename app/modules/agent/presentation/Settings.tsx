import { ModuleSettings } from '@/core/settings/presentation/index.ts';
import { Stack } from '@/shared/ui/kit/index.ts';
import { agentPreferences, agentSettings } from '@/modules/agent/settings.ts';

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

import { ModuleSettings } from '../ui/ModuleSettings.tsx';
import { agentPreferences, agentSettings } from './settings.ts';

export function AgentSettings() {
  return <ModuleSettings definition={agentSettings} store={agentPreferences} />;
}

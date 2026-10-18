import { ModuleSettings } from '@/application/settings/presentation.ts';
import { chatPreferences, chatSettings } from '@/conversation/preferences.ts';

export function ChatSettings() {
  return (
    <ModuleSettings
      definition={chatSettings}
      store={chatPreferences}
      disclosure="Customize instructions"
    />
  );
}

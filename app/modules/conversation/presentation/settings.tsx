import { ModuleSettings } from '@/core/settings/presentation/index.ts';
import { chatPreferences, chatSettings } from '@/modules/conversation/preferences.ts';

export function ChatSettings() {
  return (
    <ModuleSettings
      definition={chatSettings}
      store={chatPreferences}
      disclosure="Customize instructions"
    />
  );
}

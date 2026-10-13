import { ModuleSettings } from '../../ui/ModuleSettings.tsx';
import { chatPreferences, chatSettings } from './preferences.ts';

export function ChatSettings() {
  return <ModuleSettings definition={chatSettings} store={chatPreferences} />;
}

// The agent's preferences stay with the removable chat workflow.
import { useId, useState } from 'react';
import { Input, SettingField } from '../../ui/kit/index.ts';
import { DEFAULT_MODEL, MODEL_KEY, model } from './model.ts';

export function ChatSettings() {
  const id = useId();
  const description = `${id}-description`;
  const [value, setValue] = useState(model);
  return (
    <SettingField
      label="Model"
      htmlFor={id}
      descriptionId={description}
      description="Used for new messages. Saved on this device."
    >
      <Input
        id={id}
        aria-describedby={description}
        placeholder={DEFAULT_MODEL}
        value={value}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setValue(next);
          if (next.trim()) localStorage.setItem(MODEL_KEY, next.trim());
          else localStorage.removeItem(MODEL_KEY);
        }}
      />
    </SettingField>
  );
}

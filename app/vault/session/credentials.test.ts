import { expect, test, vi } from 'vitest';
import { createSessionCredentials, restrictSessionCredentials } from './credentials.ts';
import type { Secrets } from './sealed.ts';

test('safe credential tasks bind owner keys, preserve absence provenance and keep values private', async () => {
  const updateSecret =
    vi.fn<(key: keyof Secrets, value: string | null | undefined) => Promise<void>>();
  updateSecret.mockResolvedValue();
  const credentials = createSessionCredentials(
    {
      secrets: { github: 'login-token', openai: 'custom-key' },
      secretOverrides: { openai: 'custom-key' },
      updateSecret,
    },
    { persistent: true },
  );
  expect(credentials.github.configured).toBe(true);
  expect(credentials.github.overridden).toBe(false);
  expect(credentials.github.clear).toBeUndefined();
  expect(credentials.openai.overridden).toBe(true);
  expect(JSON.stringify(credentials)).not.toContain('login-token');
  expect(JSON.stringify(credentials)).not.toContain('custom-key');
  await credentials.openai.save(' replacement-key ');
  expect(updateSecret).toHaveBeenLastCalledWith('openai', 'replacement-key');
  await credentials.openai.restore();
  expect(updateSecret).toHaveBeenLastCalledWith('openai', undefined);
  await credentials.openai.clear!();
  expect(updateSecret).toHaveBeenLastCalledWith('openai', null);
  await expect(credentials.openai.save(' ')).rejects.toThrow('Enter a credential value.');
  expect(updateSecret).toHaveBeenCalledTimes(3);
});

test('owner pending state and Application restrictions reject tasks before credential execution', async () => {
  const updateSecret = vi.fn();
  const source = {
    secrets: { github: 'login-token' },
    secretOverrides: {},
    updateSecret,
    credentialPending: true,
  };
  const pending = createSessionCredentials(source, { persistent: true });
  await expect(pending.openai.save('replacement-key')).rejects.toThrow('being updated');
  const active = createSessionCredentials(
    { ...source, credentialPending: false },
    { persistent: false },
  );
  const restricted = restrictSessionCredentials(active, 'Finish the current Agent run.');
  await expect(restricted.openai.save('replacement-key')).rejects.toThrow('Finish the current');
  await expect(restricted.openai.restore()).rejects.toThrow('Finish the current');
  await expect(restricted.openai.clear!()).rejects.toThrow('Finish the current');
  expect(restricted.github.clear).toBeUndefined();
  expect(restricted.openai.persistent).toBe(false);
  expect(restrictSessionCredentials(active)).toBe(active);
  expect(updateSecret).not.toHaveBeenCalled();
});

test('retained task handles reread owner and application admission at execution', async () => {
  const updateSecret =
    vi.fn<(key: keyof Secrets, value: string | null | undefined) => Promise<void>>();
  updateSecret.mockResolvedValue();
  let current = {
    secrets: { github: 'login-token' },
    secretOverrides: {},
    updateSecret,
    credentialPending: false,
  };
  const credentials = createSessionCredentials(current, {
    persistent: true,
    read: () => current,
  });
  let reason: string | undefined;
  const restricted = restrictSessionCredentials(credentials, () => reason);
  current = { ...current, credentialPending: true };
  await expect(restricted.openai.save('replacement-key')).rejects.toThrow('being updated');
  current = { ...current, credentialPending: false };
  reason = 'Finish the current Agent run.';
  await expect(restricted.openai.save('replacement-key')).rejects.toThrow('Finish the current');
  expect(updateSecret).not.toHaveBeenCalled();
  reason = undefined;
  await restricted.openai.save('replacement-key');
  expect(updateSecret).toHaveBeenLastCalledWith('openai', 'replacement-key');
});

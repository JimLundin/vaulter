// @vitest-environment happy-dom
import { act, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CredentialSetting, RefreshVault, SessionStatus, SignOut, Unlock } from './ui.tsx';
import {
  createSessionCredentials,
  restrictSessionCredentials,
} from '@/core/session/credentials.ts';
import type { Secrets } from '@/core/session/sealed.ts';
import type { SecretOverrides } from '@/core/session/unlock.ts';
import { REMEMBER_DAYS } from '@/core/session/unlock.ts';

const roots: Root[] = [];
const providerField = { label: 'OpenAI API key', description: 'Used for requests.' };

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));
afterEach(async () => {
  await act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(content: ReactNode) {
  const root = createRoot(document.body);
  roots.push(root);
  await act(async () => root.render(content));
  return root;
}

function input(label: string) {
  const field = [...document.querySelectorAll('label')].find(
    (candidate) => candidate.textContent === label,
  );
  const element = field && document.getElementById(field.htmlFor);
  if (!(element instanceof HTMLInputElement)) throw new Error(`Missing input ${label}`);
  return element;
}

function button(label: string) {
  const element =
    document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`) ??
    [...document.querySelectorAll('button')].find((candidate) => candidate.textContent === label);
  if (!element) throw new Error(`Missing button ${label}`);
  return element;
}

async function fill(element: HTMLInputElement, value: string) {
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function descriptions(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

test('Session credential UI binds explicit save, restore and clear without exposing login values', async () => {
  const updateSecret =
    vi.fn<(key: keyof Secrets, value: string | null | undefined) => Promise<void>>();
  updateSecret.mockResolvedValue();
  function Credentials() {
    const [secrets, setSecrets] = useState<Secrets>({ github: 'login-token', openai: 'login-key' });
    const [secretOverrides, setOverrides] = useState<SecretOverrides>({});
    const credentials = createSessionCredentials(
      {
        secrets,
        secretOverrides,
        updateSecret: async (key, value) => {
          await updateSecret(key, value);
          setSecrets((current) => ({
            ...current,
            [key]: value === null ? undefined : (value ?? 'login-key'),
          }));
          setOverrides((current) => {
            const next = { ...current };
            if (value === undefined) delete next[key];
            else next[key] = value;
            return next;
          });
        },
      },
      { persistent: true },
    );
    return (
      <>
        <CredentialSetting credential={credentials.openai} field={providerField} />
        <CredentialSetting
          credential={credentials.github}
          field={{ label: 'GitHub token', description: 'Used for the vault.' }}
        />
      </>
    );
  }
  await mount(<Credentials />);
  expect(input('OpenAI API key').value).toBe('');
  expect(input('OpenAI API key').type).toBe('password');
  expect(descriptions(input('OpenAI API key'))).toContain('Using login value');
  expect(document.body.innerHTML).not.toContain('login-key');
  expect(document.body.innerHTML).not.toContain('login-token');
  expect(document.querySelector('button[aria-label="Clear GitHub token"]')).toBeNull();
  expect(button('Save OpenAI API key').disabled).toBe(true);
  await fill(input('OpenAI API key'), ' replacement-key ');
  expect(updateSecret).not.toHaveBeenCalled();
  await act(async () => button('Save OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', 'replacement-key');
  expect(input('OpenAI API key').value).toBe('');
  expect(document.body.innerHTML).not.toContain('replacement-key');
  expect(descriptions(input('OpenAI API key'))).toContain('Saved');
  await act(async () => button('Restore login value for OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', undefined);
  await act(async () => button('Clear OpenAI API key').click());
  expect(updateSecret).toHaveBeenLastCalledWith('openai', null);
  expect(input('OpenAI API key').placeholder).toBe('Not configured');
  expect(button('Clear OpenAI API key').disabled).toBe(true);
});

test('credential failures preserve retry drafts and application restrictions disable all tasks', async () => {
  const updateSecret =
    vi.fn<(key: keyof Secrets, value: string | null | undefined) => Promise<void>>();
  updateSecret.mockRejectedValueOnce(new Error('Encrypted settings could not be saved.'));
  updateSecret.mockResolvedValue();
  const credentials = createSessionCredentials(
    {
      secrets: { github: 'login-token', openai: 'login-key' },
      secretOverrides: { openai: 'custom-key' },
      updateSecret,
    },
    { persistent: false },
  );
  const root = await mount(
    <CredentialSetting credential={credentials.openai} field={providerField} />,
  );
  expect(document.body.textContent).toContain('Credential changes last for this session.');
  await fill(input('OpenAI API key'), 'retry-key');
  await act(async () => button('Save OpenAI API key').click());
  expect(input('OpenAI API key').value).toBe('retry-key');
  expect(input('OpenAI API key').getAttribute('aria-invalid')).toBe('true');
  expect(descriptions(input('OpenAI API key'))).toContain('Encrypted settings could not be saved.');
  await act(async () => button('Save OpenAI API key').click());
  expect(input('OpenAI API key').value).toBe('');
  const disabled = restrictSessionCredentials(credentials, 'Finish the current Agent run.');
  await act(async () =>
    root.render(<CredentialSetting credential={disabled.openai} field={providerField} />),
  );
  expect(input('OpenAI API key').disabled).toBe(true);
  expect(button('Restore login value for OpenAI API key').disabled).toBe(true);
  expect(button('Clear OpenAI API key').disabled).toBe(true);
  expect(descriptions(input('OpenAI API key'))).toContain('Finish the current Agent run.');
});

test('pending credentials prevent duplicate submits and clear the draft only after acceptance', async () => {
  let release!: () => void;
  const updateSecret = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const credentials = createSessionCredentials(
    { secrets: { github: 'login-token' }, secretOverrides: {}, updateSecret },
    { persistent: true },
  );
  await mount(<CredentialSetting credential={credentials.openai} field={providerField} />);
  await fill(input('OpenAI API key'), 'replacement-key');
  await act(() => {
    button('Save OpenAI API key').click();
    button('Save OpenAI API key').click();
  });
  expect(button('Save OpenAI API key').disabled).toBe(true);
  expect(input('OpenAI API key').value).toBe('replacement-key');
  await act(async () => button('Save OpenAI API key').click());
  expect(updateSecret).toHaveBeenCalledTimes(1);
  await act(async () => release());
  expect(input('OpenAI API key').value).toBe('');
});

test('Unlock renders owner remembrance policy, rejects a failed password and permits retry', async () => {
  const unlock = vi.fn<(password: string) => Promise<void>>();
  unlock.mockRejectedValueOnce(new Error('Wrong password.'));
  unlock.mockResolvedValue();
  await mount(<Unlock unlock={unlock} />);
  expect(document.body.textContent).toContain(`remembers it for ${REMEMBER_DAYS} days`);
  await fill(input('Password'), 'failed-password');
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(document.body.textContent).toContain("That isn't the password.");
  expect(input('Password').disabled).toBe(false);
  await fill(input('Password'), 'accepted-password');
  await act(async () =>
    document
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(unlock).toHaveBeenLastCalledWith('accepted-password');
});

test('Unlock accepts one in-flight password attempt even before its pending render', async () => {
  let release!: () => void;
  const unlock = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await mount(<Unlock unlock={unlock} />);
  await fill(input('Password'), 'password');
  await act(() => {
    const form = document.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  expect(unlock).toHaveBeenCalledTimes(1);
  expect(input('Password').disabled).toBe(true);
  await act(async () => release());
});

test('Session status and refresh/sign-out actions retain failures for explicit retry', async () => {
  const refresh = vi.fn<() => Promise<void>>();
  refresh.mockRejectedValueOnce(new Error('Refresh failed.'));
  refresh.mockResolvedValue();
  const signOut = vi.fn<() => Promise<void>>();
  signOut.mockRejectedValueOnce(new Error('Sign-out failed.'));
  signOut.mockResolvedValue();
  await mount(
    <>
      <SessionStatus status={{ kind: 'offline' }} />
      <RefreshVault status={{ kind: 'error', message: 'Node unavailable.' }} refresh={refresh} />
      <SignOut onSignOut={signOut} />
    </>,
  );
  expect(document.body.textContent).toContain('Offline');
  expect(document.body.textContent).toContain('Node unavailable.');
  await act(async () => button('Refresh vault').click());
  expect(document.body.textContent).toContain('Refresh failed.');
  await act(async () => button('Refresh vault').click());
  expect(document.body.textContent).not.toContain('Refresh failed.');
  await act(async () => button('Sign out').click());
  expect(document.body.textContent).toContain('Sign-out failed.');
  await act(async () => button('Sign out').click());
  expect(document.body.textContent).not.toContain('Sign-out failed.');
  expect(button('Sign out').disabled).toBe(true);
  await act(async () => button('Sign out').click());
  expect(signOut).toHaveBeenCalledTimes(2);
});

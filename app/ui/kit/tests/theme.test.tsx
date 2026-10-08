// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { setTheme, startTheme } from '../theme.tsx';

const root = () => document.documentElement.classList;
afterEach(() => setTheme('system'));

it('follows the system until someone chooses, and keeps the choice on this device', () => {
  startTheme();
  // happy-dom's system is light.
  expect([root().contains('light'), root().contains('dark')]).toEqual([true, false]);
  setTheme('dark');
  expect([root().contains('light'), root().contains('dark')]).toEqual([false, true]);
  expect(localStorage.getItem('vaulter.theme')).toBe('dark');
  startTheme();
  expect(root().contains('dark')).toBe(true);
  setTheme('system');
  expect(localStorage.getItem('vaulter.theme')).toBeNull();
  expect(root().contains('light')).toBe(true);
});

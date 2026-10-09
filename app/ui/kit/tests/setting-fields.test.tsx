// biome-ignore-all lint/correctness/useUniqueElementIds: Explicit and duplicate identities are intentional public-interface regression cases.
// biome-ignore-all lint/correctness/useJsxKeyInIterable: Each table entry renders independently into a fresh root, never as siblings.
// @vitest-environment happy-dom
import * as React from 'react';
import { act, Component, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import {
  Checkbox,
  Input,
  RadioGroup,
  RadioGroupItem,
  SettingField,
  Stack,
  Textarea,
  ThemeSwitch,
  ToggleGroup,
  ToggleGroupItem,
} from '../index.ts';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const roots: Root[] = [];
afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});
class DiagnosticBoundary extends Component<
  { children: ReactNode; errors: unknown[] },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.errors.push(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}
function render(children: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const errors: unknown[] = [];
  const root = createRoot(host, { onCaughtError: () => undefined });
  roots.push(root);
  act(() => root.render(<DiagnosticBoundary errors={errors}>{children}</DiagnosticBoundary>));
  return { host, errors };
}
function referencedText(element: Element, attribute: string) {
  return element
    .getAttribute(attribute)
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

it('names and describes one nested radio group without repeating instructions on its choices', () => {
  const { host, errors } = render(
    <SettingField label="Theme" description="Choose how this device looks.">
      <Stack>
        <RadioGroup aria-label="Conflicting name" defaultValue="light">
          <RadioGroupItem value="light">Light</RadioGroupItem>
          <RadioGroupItem value="dark">Dark</RadioGroupItem>
        </RadioGroup>
      </Stack>
    </SettingField>,
  );
  const group = host.querySelector('[role= radiogroup]')!;
  expect(referencedText(group, 'aria-labelledby')).toBe('Theme');
  expect(referencedText(group, 'aria-describedby')).toBe('Choose how this device looks.');
  expect(group.hasAttribute('aria-label')).toBe(false);
  expect(host.querySelector('label')).toBeNull();
  expect(
    [...host.querySelectorAll('[role=radio]')].every(
      (item) => !item.hasAttribute('aria-describedby'),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

it('rejects multiple semantic controls even when their default identities coincide', () => {
  const { errors } = render(
    <SettingField label="Ambiguous model" description="Choose a model.">
      <Stack>
        <Input />
        <Input />
      </Stack>
    </SettingField>,
  );
  expect(errors.map(String).join(' ')).toMatch(/Ambiguous model.*exactly one.*2/);
});

it('rejects unsupported controls alongside a supported control through ordinary layouts', () => {
  const { errors } = render(
    <SettingField label="Mixed model" description="Choose a model.">
      <Stack>
        <Input />
        <Checkbox aria-label="Remember" />
      </Stack>
    </SettingField>,
  );
  expect(errors.map(String).join(' ')).toMatch(/Mixed model.*unsupported/);
});

it('rejects an Input whose type is not a supported text-entry control', () => {
  const { errors } = render(
    <SettingField label="Upload" description="Choose a file.">
      <Input type="file" />
    </SettingField>,
  );
  expect(errors.map(String).join(' ')).toMatch(/Upload.*unsupported/);
});

it.each([
  ['empty', null, /found 0/],
  [
    'same explicit identities',
    <>
      <Input id="same" />
      <Input id="same" />
    </>,
    /found 2/,
  ],
  [
    'text and group',
    <>
      <Input />
      <RadioGroup>
        <RadioGroupItem value="light">Light</RadioGroupItem>
      </RadioGroup>
    </>,
    /found 2/,
  ],
  [
    'two groups',
    <>
      <ThemeSwitch />
      <ThemeSwitch />
    </>,
    /found 2/,
  ],
  [
    'nested groups',
    <RadioGroup>
      <RadioGroupItem value="one">One</RadioGroupItem>
      <RadioGroup>
        <RadioGroupItem value="two">Two</RadioGroupItem>
      </RadioGroup>
    </RadioGroup>,
    /found 2/,
  ],
  ['checkbox', <Checkbox />, /unsupported/],
  [
    'raw select',
    <select>
      <option>One</option>
    </select>,
    /unsupported/,
  ],
  [
    'mixed raw input',
    <Stack>
      <Input />
      <input />
    </Stack>,
    /unsupported/,
  ],
  [
    'toggle choices',
    <ToggleGroup type="single">
      <ToggleGroupItem value="one">One</ToggleGroupItem>
    </ToggleGroup>,
    /unsupported/,
  ],
] as const)(
  'diagnoses %s composition at the public field interface',
  (_name, children, diagnostic) => {
    const { errors } = render(
      <SettingField label="Invalid field" description="Instructions.">
        {children}
      </SettingField>,
    );
    expect(errors.map(String).join(' ')).toMatch(diagnostic);
  },
);

it('preserves explicit group identities and composes existing instructions with authoritative naming', () => {
  const { host, errors } = render(
    <>
      <p id="extra">Extra instructions.</p>
      <p id="old-name">Old name</p>
      <SettingField label="Mode" description="Choose one mode.">
        <RadioGroup
          id="chosen-mode"
          aria-label="Ignored"
          aria-labelledby="old-name"
          aria-describedby="extra extra"
        >
          <RadioGroupItem value="first">First</RadioGroupItem>
          <RadioGroupItem value="second">Second</RadioGroupItem>
        </RadioGroup>
      </SettingField>
    </>,
  );
  const group = host.querySelector('[role=radiogroup]')!;
  expect(group.id).toBe('chosen-mode');
  expect(referencedText(group, 'aria-labelledby')).toBe('Mode');
  expect(referencedText(group, 'aria-describedby')).toBe('Extra instructions. Choose one mode.');
  const references = group.getAttribute('aria-describedby')!.split(/\s+/);
  expect(new Set(references).size).toBe(2);
  expect(errors).toEqual([]);
});

it('keeps ThemeSwitch standalone meaning and independent repeated field groups', () => {
  const { host, errors } = render(
    <>
      <ThemeSwitch />
      {['First theme', 'Second theme'].map((label) => (
        <SettingField key={label} label={label} description="Choose the theme.">
          <ThemeSwitch />
        </SettingField>
      ))}
    </>,
  );
  const [standalone, first, second] = host.querySelectorAll('[role=radiogroup]');
  expect(standalone.getAttribute('aria-label')).toBe('Appearance');
  expect(referencedText(first, 'aria-labelledby')).toBe('First theme');
  expect(referencedText(second, 'aria-labelledby')).toBe('Second theme');
  expect(first.id).not.toBe(second.id);
  expect(first.getAttribute('aria-describedby')).not.toBe(second.getAttribute('aria-describedby'));
  expect(errors).toEqual([]);
});

it('leaves standalone controls and their description references untouched', () => {
  const { host, errors } = render(
    <>
      <Input id="input" aria-label="Standalone input" aria-describedby="extra extra" />
      <Textarea id="textarea" aria-labelledby="old-label" />
      <RadioGroup id="group" aria-label="Standalone group" aria-describedby="extra extra">
        <RadioGroupItem value="one">One</RadioGroupItem>
      </RadioGroup>
    </>,
  );
  expect(host.querySelector('input')?.getAttribute('aria-describedby')).toBe('extra extra');
  expect(host.querySelector('textarea')?.getAttribute('aria-labelledby')).toBe('old-label');
  expect(host.querySelector('[role=radiogroup]')?.getAttribute('aria-label')).toBe(
    'Standalone group',
  );
  expect(host.querySelector('[role=radiogroup]')?.id).toBe('group');
  expect(errors).toEqual([]);
});

it('keeps one control valid through StrictMode replay and nested control/id replacement', () => {
  let change: (mode: string) => void = () => undefined;
  function DynamicControl() {
    const [mode, setMode] = useState('initial');
    change = setMode;
    return mode === 'group' ? <ThemeSwitch /> : <Input id={mode} defaultValue="Retained value" />;
  }
  const { host, errors } = render(
    <React.StrictMode>
      <SettingField label="Dynamic field" description="Instructions.">
        <Stack>
          <DynamicControl />
        </Stack>
      </SettingField>
    </React.StrictMode>,
  );
  const input = host.querySelector('input')!;
  input.value = 'Edited value';
  act(() => change('changed'));
  expect(host.querySelector('input')).toBe(input);
  expect(input.value).toBe('Edited value');
  expect(host.querySelector('label')?.htmlFor).toBe('changed');
  act(() => change('group'));
  expect(host.querySelector('label')).toBeNull();
  expect(referencedText(host.querySelector('[role=radiogroup]')!, 'aria-labelledby')).toBe(
    'Dynamic field',
  );
  act(() => change('restored'));
  expect(host.querySelector('label')?.htmlFor).toBe('restored');
  expect(errors).toEqual([]);
});

it.each(['remove', 'add'] as const)(
  'diagnoses a nested dynamic %s without retaining stale registration',
  (operation) => {
    let change: () => void = () => undefined;
    function DynamicControl() {
      const [changed, setChanged] = useState(false);
      change = () => setChanged(true);
      return changed ? (
        operation === 'remove' ? null : (
          <>
            <Input />
            <Input />
          </>
        )
      ) : (
        <Input />
      );
    }
    const { errors } = render(
      <SettingField label="Dynamic field" description="Instructions.">
        <DynamicControl />
      </SettingField>,
    );
    expect(errors).toEqual([]);
    act(() => change());
    expect(errors.map(String).join(' ')).toMatch(operation === 'remove' ? /found 0/ : /found 2/);
  },
);

it('diagnoses unsupported public controls hidden inside a feature component', () => {
  function Remember() {
    return <Checkbox aria-label="Remember" />;
  }
  const { errors } = render(
    <SettingField label="Mixed opaque" description="Instructions.">
      <Input />
      <Remember />
    </SettingField>,
  );
  expect(errors.map(String).join(' ')).toMatch(/Mixed opaque.*unsupported/);
});

it('diagnoses an unsupported public control added by state in a nested feature component', () => {
  let change: () => void = () => undefined;
  function Remember() {
    const [shown, setShown] = useState(false);
    change = () => setShown(true);
    return shown ? <Checkbox aria-label="Remember" /> : null;
  }
  const { errors } = render(
    <SettingField label="Mixed dynamic" description="Instructions.">
      <Input />
      <Remember />
    </SettingField>,
  );
  expect(errors).toEqual([]);
  act(() => change());
  expect(errors.map(String).join(' ')).toMatch(/Mixed dynamic.*unsupported/);
});

it('accepts a supported input with its explicit textbox role', () => {
  const { errors } = render(
    <SettingField label="Model" description="Instructions.">
      <Input role="textbox" />
    </SettingField>,
  );
  expect(errors).toEqual([]);
});

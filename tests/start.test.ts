import { expect, it } from 'vitest';
import { extensions } from '#core';

it('starts every extension, and reads what each offers', async () => {
    const folders = Object.keys(import.meta.glob('../extensions/*/index.ts'));
    const loaded = await extensions();
    expect(
        loaded.map((extension) => `../extensions/${extension.id}/index.ts`),
    ).toEqual(folders);
    for (const { operations } of loaded) {
        for (const [name, own] of Object.entries(operations)) {
            // The agent names each `<extension>__<name>` for the model.
            expect(name).toMatch(/^[A-Za-z0-9]+(_[A-Za-z0-9]+)*$/);
            expect(own.description).not.toBe('');
        }
    }
    expect(
        Object.keys(loaded.find((e) => e.id === 'wiki')?.operations ?? {}),
    ).toContain('find');
});

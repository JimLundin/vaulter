import { expect, it } from 'vitest';

it('starts every extension', async () => {
    const extensions = import.meta.glob('../extensions/*/index.ts');
    expect(Object.keys(extensions).length).toBeGreaterThan(0);
    for (const importExtension of Object.values(extensions)) {
        await expect(importExtension()).resolves.toBeDefined();
    }
});

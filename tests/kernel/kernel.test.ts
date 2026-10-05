import { expect, it } from 'vitest';
import { REPO, startApp } from '../app.ts';

it('starts every extension, and lists what each exports', async () => {
    const kernel = await startApp(REPO, { maps: { tools: [] } });
    await kernel.started;
    expect(kernel.extensions().map((e) => e.id)).toEqual(
        [...REPO, 'maps'].sort(),
    );
    expect(kernel.extensions().find((e) => e.id === 'maps')?.exports).toEqual({
        tools: [],
    });
});

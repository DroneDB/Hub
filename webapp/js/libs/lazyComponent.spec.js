/**
 * Unit tests for libs/lazyComponent.js
 * Run with: npx vitest run webapp/js/libs/lazyComponent.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import { lazyComponent } from '@/libs/lazyComponent';

describe('lazyComponent', () => {
    // What a dynamic import() resolves with
    const module = component => ({ __esModule: true, default: component });

    it('loads the component once, on first use', async () => {
        const loader = vi.fn(() => Promise.resolve(module({ name: 'Dialog' })));
        const component = lazyComponent(loader);
        expect(loader).not.toHaveBeenCalled();

        const first = await component.__asyncLoader();
        await component.__asyncLoader();
        expect(loader).toHaveBeenCalledTimes(1);
        expect(first.name).toBe('Dialog');
    });

    it('retries a failed load once, then reports it', async () => {
        const notify = vi.fn();
        const loader = vi.fn()
            .mockRejectedValueOnce(new Error('chunk failed'))
            .mockRejectedValueOnce(new Error('chunk failed again'));
        const component = lazyComponent(loader, { notify });

        await expect(component.__asyncLoader()).rejects.toThrow('chunk failed again');
        expect(loader).toHaveBeenCalledTimes(2);
        expect(notify).toHaveBeenCalledTimes(1);
    });

    it('a retry that succeeds is not reported', async () => {
        const notify = vi.fn();
        const loader = vi.fn()
            .mockRejectedValueOnce(new Error('blip'))
            .mockResolvedValueOnce(module({ name: 'Dialog' }));
        const component = lazyComponent(loader, { notify });

        expect((await component.__asyncLoader()).name).toBe('Dialog');
        expect(notify).not.toHaveBeenCalled();
    });
});

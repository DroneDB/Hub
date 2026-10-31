import { describe, it, expect, vi } from 'vitest';
import { resolvePasteStrategy } from './usePasteStrategy';

const items = [{ path: 'a/one.jpg' }, { path: 'a/two.jpg' }];
const target = { orgSlug: 'org', dsSlug: 'other', basePath: 'dest' };

function source(transferObj) {
    return { orgSlug: 'org', dsSlug: 'ds', dataset: { transferObj } };
}

describe('resolvePasteStrategy', () => {
    it('moves between datasets (the source is not kept) and copies them (it is)', async () => {
        for (const [mode, keepSource] of [['cut', false], ['copy', true]]) {
            const transferObj = vi.fn().mockResolvedValue(undefined);
            const src = source(transferObj);
            const result = await resolvePasteStrategy(src, mode, target).execute(items, src, target, { conflictMode: 'ask' });
            expect(transferObj).toHaveBeenCalledWith('a/one.jpg', 'org', 'other', 'dest/one.jpg', false, keepSource);
            expect(result.succeeded).toEqual([
                { source: 'a/one.jpg', dest: 'dest/one.jpg' }, { source: 'a/two.jpg', dest: 'dest/two.jpg' }
            ]);
        }
    });

    it('skips a transfer that fails when the user chose to skip conflicts, and reports it otherwise', async () => {
        const transferObj = vi.fn().mockRejectedValue(new Error('exists'));
        const src = source(transferObj);
        const skipped = await resolvePasteStrategy(src, 'copy', target).execute(items, src, target, { conflictMode: 'skip' });
        expect(skipped.skipped).toEqual(['a/one.jpg', 'a/two.jpg']);
        const failed = await resolvePasteStrategy(src, 'copy', target).execute(items, src, target, { conflictMode: 'ask' });
        expect(failed.failed).toEqual({ 'a/one.jpg': 'exists', 'a/two.jpg': 'exists' });
    });

    it('resolves a move inside one dataset to a server-side move', async () => {
        const moveObj = vi.fn().mockResolvedValue(undefined);
        const inside = { orgSlug: 'org', dsSlug: 'ds', basePath: 'dest', dataset: { moveObj } };
        const result = await resolvePasteStrategy({ orgSlug: 'org', dsSlug: 'ds' }, 'cut', inside)
            .execute(items, inside, inside, { conflictMode: 'ask' });
        expect(moveObj).toHaveBeenCalledWith('a/one.jpg', 'dest/one.jpg');
        expect(result.failed).toEqual({});
    });

    it('rejects an unknown mode', () => {
        expect(() => resolvePasteStrategy(null, 'paste', target)).toThrow(/paste/);
    });
});

/**
 * The one question before the Hub replaces an existing file (FR-XC-07): a danger confirmation that
 * names the file and its folder, true only for Replace; and the 409 that asks it after a race.
 */
import { describe, it, expect, vi } from 'vitest';
import { effectScope } from 'vue';
import ddb from 'ddb';
import { useDialogs } from './useDialogs';
import {
    useConfirmReplace, replaceConfirmation, replaceConflictPath, conflictIsFolder, existingItem, namesInFolder
} from './useConfirmReplace';
import { ApiError } from '@/libs/ddb/apiError';

describe('conflictIsFolder', () => {
    const { DIRECTORY, GEORASTER } = ddb.entry.type;

    it('reads the listing in view first, without a request', async () => {
        const dataset = { list: vi.fn() };
        expect(await conflictIsFolder(dataset, 'a/out.tif', [{ entry: { path: 'A/OUT.tif', type: DIRECTORY } }])).toBe(true);
        expect(await conflictIsFolder(dataset, 'a/out.tif', [{ entry: { path: 'a/out.tif', type: GEORASTER } }])).toBe(false);
        expect(dataset.list).not.toHaveBeenCalled();
    });

    it('else lists the parent folder (letter case ignored), and a failed read is not a folder', async () => {
        const dataset = { list: vi.fn().mockResolvedValue([{ path: 'a/OUT.tif', type: DIRECTORY }]) };
        expect(await conflictIsFolder(dataset, 'a/out.tif', [])).toBe(true);
        expect(dataset.list).toHaveBeenCalledWith('a');
        dataset.list.mockResolvedValue([{ path: 'root.tif', type: GEORASTER }]);
        expect(await conflictIsFolder(dataset, 'root.tif')).toBe(false);
        expect(dataset.list).toHaveBeenLastCalledWith(undefined);
        dataset.list.mockRejectedValue(new Error('offline'));
        expect(await conflictIsFolder(dataset, 'a/out.tif')).toBe(false);
    });
});

describe('useConfirmReplace', () => {
    it('asks with a danger dialog and resolves true only for Replace', async () => {
        const dialogs = effectScope().run(() => useDialogs());
        const confirmReplace = useConfirmReplace(dialogs);

        const yes = confirmReplace('images/IMG_0180_merged.tif');
        expect(dialogs.stack.value[0].props).toMatchObject({
            title: 'Replace “IMG_0180_merged.tif”?', confirmText: 'Replace', confirmButtonClass: 'danger'
        });
        dialogs.close(dialogs.stack.value[0].id, 'confirm');
        await expect(yes).resolves.toBe(true);

        const no = confirmReplace('a.tif');
        dialogs.close(dialogs.stack.value[0].id, 'cancel');
        await expect(no).resolves.toBe(false);
    });

    it('names the file and its folder, escaped, and says it cannot be undone', () => {
        const { message } = replaceConfirmation('a<b>/x&y.tif');
        expect(message).toContain('<strong>x&amp;y.tif</strong>');
        expect(message).toContain('the folder <strong>a&lt;b&gt;</strong>');
        expect(message).toContain('This cannot be undone.');
        expect(replaceConfirmation('root.tif').message).toContain('already exists in this folder');
    });
});

describe('existingItem', () => {
    it('finds the listed item at a path without regard to case (D-040)', () => {
        const items = [{ entry: { path: 'images/A.tif' } }, { entry: { path: 'images/b.tif' } }];
        expect(existingItem('images/a.TIF', items)).toBe(items[0]);
        expect(existingItem('images/c.tif', items)).toBeNull();
        expect(existingItem('a.tif', undefined)).toBeNull();
    });
});

describe('namesInFolder', () => {
    it('lists the names of the items of one folder, for freeName', () => {
        const items = [
            { entry: { path: 'root.tif' } }, { entry: { path: 'Images/a.tif' } },
            { entry: { path: 'images/b.tif' } }, { entry: { path: 'images/sub/c.tif' } }
        ];
        expect(namesInFolder('images', items)).toEqual(['a.tif', 'b.tif']);
        expect(namesInFolder('images/', items)).toEqual(['a.tif', 'b.tif']);
        expect(namesInFolder('', items)).toEqual(['root.tif']);
        expect(namesInFolder('x', null)).toEqual([]);
    });
});

describe('replaceConflictPath', () => {
    it('is the conflictPath of a 409, and null for any other error', () => {
        expect(replaceConflictPath(new ApiError('exists', 409, { conflictPath: 'images/a.tif' }))).toBe('images/a.tif');
        expect(replaceConflictPath(new ApiError('busy', 409))).toBeNull();
        expect(replaceConflictPath(new ApiError('later', 503, { conflictPath: 'a.tif' }))).toBeNull();
        expect(replaceConflictPath(new Error('boom'))).toBeNull();
        expect(replaceConflictPath(null)).toBeNull();
    });
});

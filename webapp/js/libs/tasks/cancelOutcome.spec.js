/**
 * cancelTaskOutcome (FR-PRC-10): a 400 for a task that has already ended is a neutral result,
 * told by the status and a re-read of the task, never by the message text.
 */
import { describe, it, expect, vi } from 'vitest';
import { cancelTaskOutcome } from './cancelOutcome';
import { ApiError } from '@/libs/ddb/apiError';

const ENDED_MSG = 'The task has already ended (Succeeded); only a queued or running task can be cancelled';

function fakeDataset(cancel, read = () => Promise.resolve({ state: 'Succeeded' })) {
    return { cancelTask: vi.fn(cancel), getTask: vi.fn(read) };
}

describe('cancelTaskOutcome', () => {
    it('is cancelled when the server deleted the task', async () => {
        const ds = fakeDataset(() => Promise.resolve({ deleted: true }));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'cancelled' });
        expect(ds.cancelTask).toHaveBeenCalledWith('t1');
        expect(ds.getTask).not.toHaveBeenCalled();
    });

    it('is noChange when the server answered 200 but deleted nothing', async () => {
        const ds = fakeDataset(() => Promise.resolve({ deleted: false }));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'noChange' });
        expect(ds.getTask).not.toHaveBeenCalled();
    });

    it('is alreadyEnded on a 400 when the task, read again, is terminal', async () => {
        const ds = fakeDataset(() => Promise.reject(new ApiError(ENDED_MSG, 400)));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'alreadyEnded' });
        expect(ds.getTask).toHaveBeenCalledWith('t1');
    });

    it('does not read the message: a 400 with any text for an ended task is alreadyEnded', async () => {
        const ds = fakeDataset(() => Promise.reject(new ApiError('something else', 400)), () => Promise.resolve({ state: 'Failed' }));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'alreadyEnded' });
    });

    it('fails on a 400 when the task, read again, is still active', async () => {
        const error = new ApiError('Refused', 400);
        const ds = fakeDataset(() => Promise.reject(error), () => Promise.resolve({ state: 'Processing' }));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'failed', error });
    });

    it('fails on a 400 when the task cannot be read again', async () => {
        const error = new ApiError(ENDED_MSG, 400);
        const ds = fakeDataset(() => Promise.reject(error), () => Promise.reject(new ApiError('Not found', 404)));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'failed', error });
    });

    it('fails on another status without reading the task again', async () => {
        const error = new ApiError('Server error', 500);
        const ds = fakeDataset(() => Promise.reject(error));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'failed', error });
        expect(ds.getTask).not.toHaveBeenCalled();
    });

    it('fails on a plain Error, even one whose text says the task has ended', async () => {
        const error = new Error(ENDED_MSG);
        const ds = fakeDataset(() => Promise.reject(error));
        expect(await cancelTaskOutcome(ds, 't1')).toEqual({ outcome: 'failed', error });
        expect(ds.getTask).not.toHaveBeenCalled();
    });
});

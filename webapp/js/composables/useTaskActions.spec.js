/**
 * useTaskActions (FR-XC-15): the row actions of the dataset Tasks tab and Admin > Tasks. The buttons come from the
 * server's `actions` (D-024); a cancel refused for a task that has already ended is a neutral result told by the
 * status and a re-read of the task, never by the message text (FR-PRC-10, D-002), and the rows are read again in
 * every case; a retry says so and shows the row queued at once (FR-PRC-19); every action confirms its result
 * (FR-PRC-29); the log title names the tool, the target, the dataset and the time (FR-PRC-29).
 */
import { describe, it, expect, vi } from 'vitest';
import { useTaskActions, cancelTaskOutcome, offersAction } from './useTaskActions';
import { ApiError } from '@/libs/ddb/apiError';
import { taskDateTime } from '@/libs/tasks/taskFormat';

const ENDED_MSG = 'The task has already ended (Succeeded); only a queued or running task can be cancelled';

function fakeDataset(cancel, read = () => Promise.resolve({ state: 'Succeeded' })) {
    return { cancelTask: vi.fn(cancel), getTask: vi.fn(read), retryTask: vi.fn(() => Promise.resolve()) };
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

const TASK = { taskId: 't1', toolId: 'merge', state: 'Processing', orgSlug: 'org', dsSlug: 'ds', createdAt: '2026-11-09T10:00:00Z' };

function setup({ dataset = fakeDataset(() => Promise.resolve({ deleted: true })), confirmed = true, deleteTask } = {}) {
    const notify = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
    const refresh = vi.fn(() => Promise.resolve());
    const confirm = vi.fn(() => Promise.resolve(confirmed));
    const remove = deleteTask ?? vi.fn(() => Promise.resolve());
    const actions = useTaskActions({
        datasetOf: vi.fn(() => dataset), deleteTask: remove, refresh, confirm,
        toolTitle: () => 'Merge <bands>', datasetName: t => `${t.orgSlug}/${t.dsSlug}`, notify
    });
    return { actions, dataset, notify, refresh, confirm, remove };
}

describe('useTaskActions.can', () => {
    it('offers what the server lists for the row, and nothing for a row without the list', () => {
        const { actions } = setup();
        expect(actions.can({ actions: ['viewLog', 'cancel'] }, 'cancel')).toBe(true);
        expect(actions.can({ actions: ['viewLog'] }, 'cancel')).toBe(false);
        expect(actions.can({ state: 'Processing' }, 'cancel')).toBe(false);
        expect(offersAction(null, 'viewLog')).toBe(false);
    });
});

describe('useTaskActions.cancel', () => {
    it('asks a danger question naming the tool and its target, escaped', async () => {
        const { actions, confirm } = setup();
        await actions.cancel({ ...TASK, targetLabel: '→ out<1>.tif' });
        const question = confirm.mock.calls[0][0];
        expect(question).toMatchObject({ title: 'Cancel Task', danger: true, confirmText: 'Cancel Task', cancelText: "Don't Cancel" });
        expect(question.message).toContain('<strong>Merge &lt;bands&gt;</strong> (→ out&lt;1&gt;.tif)');
    });

    it('tells an import that its files and the dataset it created are deleted (FR-UPL-05)', async () => {
        const { actions, confirm } = setup();
        await actions.cancel({ ...TASK, toolId: 'import-dataset' });
        expect(confirm.mock.calls[0][0]).toMatchObject({
            title: 'Cancel Task', danger: true, warningTitle: 'This cannot be undone.',
            warningMessage: 'The files imported so far are deleted, and so is the dataset that this import created.'
        });
    });

    it('asks the plain question, naming the path, for a task that adds no files', async () => {
        const { actions, confirm } = setup();
        await actions.cancel({ ...TASK, toolId: 'build', path: 'a/b.tif' });
        const question = confirm.mock.calls[0][0];
        expect(question.message).toBe('Are you sure you want to cancel this task?<br/><strong>Merge &lt;bands&gt;</strong> (path: a/b.tif) will be stopped.');
        expect(question.warningMessage).toBeUndefined();
    });

    it('confirms a cancel with "Task cancelled" and refreshes the rows', async () => {
        const { actions, notify, refresh } = setup();
        expect(await actions.cancel(TASK)).toEqual({ outcome: 'cancelled' });
        expect(notify.success).toHaveBeenCalledWith('The task has been stopped.', { summary: 'Task cancelled' });
        expect(refresh).toHaveBeenCalled();
    });

    it('shows a neutral message and refreshes when the server refuses the cancel of a task that has already ended', async () => {
        const { actions, notify, refresh, dataset } = setup({
            dataset: fakeDataset(() => Promise.reject(new ApiError(ENDED_MSG, 400)))
        });
        await actions.cancel(TASK);
        expect(dataset.getTask).toHaveBeenCalledWith('t1');
        expect(notify.info).toHaveBeenCalledWith('The task had already ended, so there was nothing to cancel.', { summary: 'Not cancelled' });
        expect(notify.error).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('shows the refusal as an error when the task is still active, and refreshes', async () => {
        const { actions, notify, refresh } = setup({
            dataset: fakeDataset(() => Promise.reject(new ApiError('Refused', 400)), () => Promise.resolve({ state: 'Processing' }))
        });
        await actions.cancel(TASK);
        expect(notify.error).toHaveBeenCalledWith('Refused', { summary: 'Cancel failed' });
        expect(notify.info).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('says nothing when the server deleted nothing: the refreshed row shows how the task ended', async () => {
        const { actions, notify, refresh } = setup({ dataset: fakeDataset(() => Promise.resolve({ deleted: false })) });
        await actions.cancel(TASK);
        expect(notify.success).not.toHaveBeenCalled();
        expect(notify.info).not.toHaveBeenCalled();
        expect(notify.error).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalled();
    });

    it('does nothing when the cancel is not confirmed', async () => {
        const { actions, dataset, refresh } = setup({ confirmed: false });
        expect(await actions.cancel(TASK)).toBeNull();
        expect(dataset.cancelTask).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('useTaskActions.retry', () => {
    it('says "Task queued again" and shows the row queued at once, without its error and progress', async () => {
        const { actions, notify, refresh, dataset } = setup();
        const task = { ...TASK, state: 'Failed', error: 'Boom', errorType: 'X', progressPercent: 40, phaseMessage: 'p', actions: ['viewLog', 'retry', 'delete'] };
        expect(await actions.retry(task)).toBe(true);
        expect(dataset.retryTask).toHaveBeenCalledWith('t1');
        expect(task).toMatchObject({ state: 'Enqueued', error: null, errorType: null, progressPercent: null, phaseMessage: null, actions: ['viewLog', 'cancel'] });
        expect(notify.success).toHaveBeenCalledWith('The task will run again from the beginning.', { summary: 'Task queued again' });
        expect(refresh).toHaveBeenCalled();
    });

    it('shows the refusal of a submit check and leaves the row as it is', async () => {
        const dataset = fakeDataset(() => Promise.resolve({ deleted: true }));
        dataset.retryTask = vi.fn(() => Promise.reject(new ApiError('"out.tif" is being written by another task', 409)));
        const { actions, notify, refresh } = setup({ dataset });
        const task = { ...TASK, state: 'Failed', error: 'Boom' };
        expect(await actions.retry(task)).toBe(false);
        expect(notify.error).toHaveBeenCalledWith('"out.tif" is being written by another task', { summary: 'Retry failed' });
        expect(task.state).toBe('Failed');
        expect(refresh).not.toHaveBeenCalled();
    });
});

describe('useTaskActions, one action at a time per task', () => {
    it('ignores a second retry of the same task while one runs: one POST, one toast', async () => {
        const dataset = fakeDataset(() => Promise.resolve({ deleted: true }));
        let release;
        dataset.retryTask = vi.fn(() => new Promise(resolve => { release = resolve; }));
        const { actions, notify } = setup({ dataset });
        const task = { ...TASK, state: 'Failed', actions: ['viewLog', 'retry'] };
        const first = actions.retry(task);
        expect(actions.isBusy(task)).toBe(true);
        expect([...actions.busyIds]).toEqual(['t1']);
        expect(await actions.retry(task)).toBe(false);
        release();
        expect(await first).toBe(true);
        expect(dataset.retryTask).toHaveBeenCalledTimes(1);
        expect(notify.success).toHaveBeenCalledTimes(1);
        expect(notify.error).not.toHaveBeenCalled();
        expect(actions.isBusy(task)).toBe(false);
    });

    it('ignores a second cancel of the same task while one runs, and a retry of another task goes on', async () => {
        const dataset = fakeDataset(() => Promise.resolve({ deleted: true }));
        let release;
        dataset.cancelTask = vi.fn(() => new Promise(resolve => { release = resolve; }));
        const { actions, confirm } = setup({ dataset });
        const first = actions.cancel(TASK);
        expect(await actions.cancel(TASK)).toBeNull();
        expect(await actions.retry({ ...TASK, taskId: 't2' })).toBe(true);
        await vi.waitFor(() => expect(dataset.cancelTask).toHaveBeenCalled());
        release({ deleted: true });
        await first;
        expect(confirm).toHaveBeenCalledTimes(1);
        expect(dataset.cancelTask).toHaveBeenCalledTimes(1);
        expect(actions.isBusy(TASK)).toBe(false);
    });

    it('frees the task after a failed retry so it can be tried again', async () => {
        const dataset = fakeDataset(() => Promise.resolve({ deleted: true }));
        dataset.retryTask = vi.fn(() => Promise.reject(new ApiError('No', 409)));
        const { actions } = setup({ dataset });
        expect(await actions.retry({ ...TASK })).toBe(false);
        expect(await actions.retry({ ...TASK })).toBe(false);
        expect(dataset.retryTask).toHaveBeenCalledTimes(2);
    });
});

describe('useTaskActions.remove', () => {
    it('asks with the shared delete wording: the task by its tool and target, Delete / Cancel', async () => {
        const { actions, confirm, remove } = setup({ confirmed: false });
        expect(await actions.remove({ ...TASK, state: 'Succeeded', path: 'a.tif' })).toBe(false);
        const question = confirm.mock.calls[0][0];
        expect(question).toMatchObject({ title: 'Delete task “Merge <bands>”', confirmText: 'Delete', cancelText: 'Cancel', danger: true });
        expect(question.message).toContain('<strong>Merge &lt;bands&gt;</strong> on a.tif');
        expect(question.message).toContain('results it produced');
        expect(remove).not.toHaveBeenCalled();
    });

    it('removes the task, says so and refreshes', async () => {
        const { actions, notify, refresh, remove } = setup();
        const task = { ...TASK, state: 'Failed' };
        expect(await actions.remove(task)).toBe(true);
        expect(remove).toHaveBeenCalledWith(task);
        expect(notify.success).toHaveBeenCalledWith('The task has been removed from history.', { summary: 'Task deleted' });
        expect(refresh).toHaveBeenCalled();
    });
});

describe('useTaskActions.logTitle', () => {
    it('names the tool, the target, the dataset and when the task was created', () => {
        const { actions } = setup();
        expect(actions.logTitle({ ...TASK, targetLabel: '→ out.tif' }))
            .toBe(`Merge <bands> · → out.tif · org/ds · ${taskDateTime(TASK.createdAt)}`);
        expect(actions.logTitle({ ...TASK, path: 'a/b.tif' })).toContain(' · a/b.tif · ');
        expect(actions.logTitle(null)).toBe('');
    });
});

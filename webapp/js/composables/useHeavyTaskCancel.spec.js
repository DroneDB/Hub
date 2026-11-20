/**
 * The Cancel of a tool dialog's task (FR-PRC-10): the question of every task cancel, the cancel of the task, the
 * poller read again so that the run of the dialog ends.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useHeavyTaskCancel } from './useHeavyTaskCancel';
import taskMonitor from '@/libs/tasks/taskMonitor';

vi.mock('@/libs/tasks/taskMonitor', () => ({ default: { forceRefresh: vi.fn() } }));
vi.mock('@/libs/notify', () => ({ notify: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
const confirm = vi.fn();
vi.mock('@/composables/useConfirm', () => ({ useConfirm: () => confirm }));

const dataset = { cancelTask: vi.fn(), getTask: vi.fn() };
const setup = () => useHeavyTaskCancel(() => dataset, { open: vi.fn() });

describe('useHeavyTaskCancel', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        taskMonitor.forceRefresh.mockResolvedValue(undefined);
        dataset.cancelTask.mockResolvedValue({ deleted: true });
    });

    it('asks with the tool as the user sees it, cancels the task and reads the poller again', async () => {
        confirm.mockResolvedValue(true);
        const { cancelHeavyTask, cancelling } = setup();
        const result = await cancelHeavyTask({ taskId: 't1', toolId: 'build' }, 'Build');

        expect(result).toEqual({ outcome: 'cancelled' });
        expect(confirm.mock.calls[0][0].message).toContain('<strong>Build</strong>');
        expect(dataset.cancelTask).toHaveBeenCalledWith('t1');
        expect(taskMonitor.forceRefresh).toHaveBeenCalledWith(dataset);
        expect(cancelling.value).toBe(false);
    });

    it('does nothing when the user does not confirm', async () => {
        confirm.mockResolvedValue(false);
        const { cancelHeavyTask } = setup();
        expect(await cancelHeavyTask({ taskId: 't1' }, 'Build')).toBeNull();
        expect(dataset.cancelTask).not.toHaveBeenCalled();
    });

    it('does nothing without a task, and ignores a second cancel while the first is asked', async () => {
        let answer;
        confirm.mockImplementation(() => new Promise(resolve => { answer = resolve; }));
        const { cancelHeavyTask, cancelling } = setup();
        expect(await cancelHeavyTask(null)).toBeNull();

        const first = cancelHeavyTask({ taskId: 't1' }, 'Build');
        expect(cancelling.value).toBe(true);
        expect(await cancelHeavyTask({ taskId: 't1' }, 'Build')).toBeNull();
        answer(true);
        await first;
        expect(dataset.cancelTask).toHaveBeenCalledOnce();
    });

    it('still ends when the poller cannot be read again', async () => {
        confirm.mockResolvedValue(true);
        taskMonitor.forceRefresh.mockRejectedValue(new Error('offline'));
        const { cancelHeavyTask, cancelling } = setup();
        await expect(cancelHeavyTask({ taskId: 't1' }, 'Build')).resolves.toEqual({ outcome: 'cancelled' });
        expect(cancelling.value).toBe(false);
    });
});

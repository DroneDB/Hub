/**
 * The task monitor as the specs of a task dialog mock it (`vi.mock('@/libs/tasks/taskMonitor', () =>
 * import('@/specs/taskMonitorMock'))`): the refresh after a submit, and the cancel of a user, which the monitor does not
 * follow here, so the dialog tells it itself.
 */
import { vi } from 'vitest';

export default {
    forceRefresh: vi.fn().mockResolvedValue(undefined),
    followCancelled: vi.fn(() => false)
};

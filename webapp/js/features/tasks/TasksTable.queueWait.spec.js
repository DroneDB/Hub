/**
 * FR-PRC-15: the Tasks table shows how long a task waited in the queue (startedAt - createdAt) next to its duration, so a
 * minute-long export that was queued for 50 s reads as a short run behind a long wait.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const base = { toolId: 'raster-export', version: '1', path: 'ortho.tif', state: 'Succeeded', createdAt: '2026-10-31T10:00:00Z' };
const waited = { ...base, taskId: '1', startedAt: '2026-10-31T10:00:50Z', finishedAt: '2026-10-31T10:01:10Z' };
const immediate = { ...base, taskId: '2', path: 'dem.tif', startedAt: '2026-10-31T10:00:00Z', finishedAt: '2026-10-31T10:00:20Z' };

let wrapper;
afterEach(() => wrapper?.unmount());

const rowOf = text => {
    wrapper = mount(TasksTable, {
        props: { tasks: [waited, immediate], tools: [{ id: 'raster-export', title: 'Export raster' }], rows: 10 },
        global: { plugins: [PrimeVue] }
    });
    return wrapper.findAll('tbody tr').find(r => r.text().includes(text));
};

describe('TasksTable the wait in the queue', () => {
    it('shows the wait next to the duration of a task that was queued', () => {
        const row = rowOf('ortho.tif');
        expect(row.find('.duration').text()).toBe('20s');
        expect(row.find('[data-testid="task-waiting"]').text()).toBe('waited 50s');
    });

    it('shows nothing for a task that started at once', () => {
        expect(rowOf('dem.tif').find('[data-testid="task-waiting"]').exists()).toBe(false);
    });
});

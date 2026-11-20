/**
 * A failed task says why it failed (FR-XC-06, AC-025): the per-dataset Tasks tab and the admin Tasks page both draw
 * their rows with this table, and a Failed row shows a red "Failed" tag and the task's error (the server's message,
 * without server paths), with the exception type as the tooltip; never a full 100% bar.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const MESSAGE = 'The file is damaged or not a valid GeoTIFF';
const base = { toolId: 'build', version: '1', createdAt: '2026-10-31T00:58:56Z', finishedAt: '2026-10-31T00:58:57Z' };
const failed = { ...base, taskId: '7', state: 'Failed', path: 'broken.tif', progressPercent: 100, errorType: 'DdbException', error: MESSAGE };
const older = { ...base, taskId: '6', state: 'Failed', path: 'older.tif', progressPercent: 40, errorType: 'InvalidOperationException', error: null };
const built = { ...base, taskId: '5', state: 'Succeeded', path: 'ortho.tif', progressPercent: 100 };

let wrapper;
afterEach(() => wrapper?.unmount());

function progressCellOf(path) {
    wrapper = mount(TasksTable, {
        props: { tasks: [failed, older, built], tools: [{ id: 'build', title: 'Build' }], rows: 10 },
        global: { plugins: [PrimeVue] }
    });
    const row = wrapper.findAll('tbody tr').find(r => r.text().includes(path));
    return row.findAll('td')[2];
}

describe('TasksTable, a failed task', () => {
    it('shows a red Failed tag and the error, with the exception type as the tooltip, and no bar', () => {
        const progress = progressCellOf('broken.tif');

        const tag = progress.find('.p-tag');
        expect(tag.classes()).toContain('p-tag-danger');
        expect(tag.text()).toBe('Failed');
        const error = progress.find('.error-text');
        expect(error.text()).toBe(MESSAGE);
        expect(error.attributes('title')).toBe('DdbException');
        expect(progress.find('.p-progressbar').exists()).toBe(false);
        expect(progress.text()).not.toContain('100%');
    });

    it('shows the exception type of a task that failed before the server kept messages', () => {
        const progress = progressCellOf('older.tif');

        expect(progress.find('.error-text').text()).toBe('InvalidOperationException');
        expect(progress.find('.p-progressbar').exists()).toBe(false);
    });

    it('keeps the full bar of a task that succeeded', () => {
        const progress = progressCellOf('ortho.tif');

        expect(progress.find('.p-progressbar').exists()).toBe(true);
        expect(progress.find('.error-text').exists()).toBe(false);
    });
});

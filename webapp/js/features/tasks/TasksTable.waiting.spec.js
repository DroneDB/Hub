/**
 * A build whose entry waits for files (an .obj without its .mtl) succeeds, as libddb defers it without failing:
 * the server lists it with waitingForFiles and the files it waits for. The task table shows it as a yellow
 * "Waiting for files" state with the names of those files, not as a green Succeeded with a full bar; the
 * per-dataset Tasks tab and the admin Tasks page both draw their rows with this table.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const MTL = 'odm_textured_model_geo.mtl';
const base = { toolId: 'build', version: '1', createdAt: '2026-10-31T00:58:56Z', finishedAt: '2026-10-31T00:58:57Z' };
const waiting = { ...base, taskId: '23', state: 'Succeeded', path: 'house.obj', waitingForFiles: true, missingFiles: [MTL] };
const built = { ...base, taskId: '22', state: 'Succeeded', path: 'orthophoto.tif', waitingForFiles: false, missingFiles: null };

let wrapper;
afterEach(() => wrapper?.unmount());

function rowOf(taskId) {
    wrapper = mount(TasksTable, {
        props: { tasks: [waiting, built], tools: [{ id: 'build', title: 'Build' }], rows: 10 },
        global: { plugins: [PrimeVue] }
    });
    const rows = wrapper.findAll('tbody tr');
    return rows.find(r => r.text().includes(taskId === '23' ? 'house.obj' : 'orthophoto.tif'));
}

describe('TasksTable, a build that waits for files', () => {
    it('shows a yellow Waiting for files state with the missing file names, and no bar', () => {
        const row = rowOf('23');
        const [state, progress] = [row.findAll('td')[0], row.findAll('td')[2]];

        const stateTag = state.find('.p-tag');
        expect(stateTag.classes()).toContain('p-tag-warn');
        expect(stateTag.attributes('title')).toContain(MTL);
        expect(stateTag.attributes('aria-label')).toBe('Waiting for files');

        const tag = progress.find('.p-tag');
        expect(tag.classes()).toContain('p-tag-warn');
        expect(tag.text()).toBe('Waiting for files');
        expect(progress.find('.missing-files').text()).toBe(MTL);
        expect(progress.find('.p-progressbar').exists()).toBe(false);
    });

    it('keeps a build that completed green with its full bar', () => {
        const row = rowOf('22');
        const [state, progress] = [row.findAll('td')[0], row.findAll('td')[2]];

        expect(state.find('.p-tag').classes()).toContain('p-tag-success');
        expect(state.find('.p-tag').attributes('title')).toBe('Succeeded');
        expect(progress.find('.p-progressbar').exists()).toBe(true);
        expect(progress.text()).not.toContain('Waiting for files');
    });
});

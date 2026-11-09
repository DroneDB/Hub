/**
 * The Cancel action of a task row (FR-XC-27, FR-UPL-05, D-024): shown when the Registry lists
 * `cancel` in the row's actions, hidden (not disabled) when it does not: a committed task, an ended
 * one, or a reader who may not cancel it. The row does not decide it from the state.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => {
    const states = [
        { value: 'Processing', terminal: false }, { value: 'Enqueued', terminal: false },
        { value: 'Succeeded', terminal: true }, { value: 'Failed', terminal: true }
    ];
    return { features: { value: key => (key === 'taskStates' ? states : []) } };
});
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const base = { toolId: 'merge-multispectral', version: '1', createdAt: '2026-10-31T00:58:56Z' };
const row = (taskId, extra) => ({ ...base, taskId, path: `p${taskId}.tif`, ...extra });

let wrapper;
afterEach(() => wrapper?.unmount());

function cancelButtonOf(task) {
    wrapper = mount(TasksTable, {
        props: { tasks: [task], tools: [{ id: 'merge-multispectral', title: 'Merge' }], rows: 10 },
        global: { plugins: [PrimeVue] }
    });
    return wrapper.find('button[aria-label="Cancel"]');
}

describe('TasksTable Cancel action', () => {
    it('is offered for an active task whose actions list it', () => {
        expect(cancelButtonOf(row('1', { state: 'Processing', cancellable: true, actions: ['viewLog', 'cancel'] })).exists()).toBe(true);
    });

    it('is not offered from the state alone: a row without actions offers nothing', () => {
        expect(cancelButtonOf(row('2', { state: 'Processing' })).exists()).toBe(false);
    });

    it('is hidden, not disabled, for a committed task, whose actions leave it out', () => {
        expect(cancelButtonOf(row('3', { state: 'Processing', cancellable: false, actions: ['viewLog'] })).exists()).toBe(false);
        expect(wrapper.find('button[title="Cancel"]').exists()).toBe(false);
    });

    it('is not offered for an ended task', () => {
        expect(cancelButtonOf(row('4', { state: 'Succeeded', actions: ['viewLog', 'delete'] })).exists()).toBe(false);
    });

    it('asks to cancel the row when clicked', async () => {
        const button = cancelButtonOf(row('5', { state: 'Enqueued', cancellable: true, actions: ['viewLog', 'cancel'] }));
        await button.trigger('click');
        expect(wrapper.emitted('cancel')[0][0]).toMatchObject({ taskId: '5' });
    });
});

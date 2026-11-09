/**
 * TasksTable draws a row as the server describes it (FR-XC-15, D-024): only the actions the summary lists
 * (FR-PRC-21), the tool's label of the target instead of "Whole dataset" (FR-PRC-22, FR-PRC-43), a cancelled task
 * as "Cancelled at n %" (FR-PRC-20) and a task queued on a processing node as waiting (FR-PRC-37).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';

const reg = vi.hoisted(() => ({ features: { value: () => [] } }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: TasksTable } = await import('./TasksTable.vue');

const base = { toolId: 'merge', version: '1', createdAt: '2026-11-09T10:00:00Z' };

let wrapper;
afterEach(() => wrapper?.unmount());

function row(task) {
    wrapper = mount(TasksTable, {
        props: { tasks: [{ ...base, taskId: 't1', ...task }], tools: [{ id: 'merge', title: 'Merge' }], rows: 10 },
        global: { plugins: [PrimeVue] }
    });
    return wrapper.find('tbody tr');
}

const buttons = tr => tr.findAll('td').at(-1).findAll('button').map(b => b.attributes('aria-label'));

describe('TasksTable, the actions of a row', () => {
    it('renders only the actions the server lists: a reader of an active task gets none', () => {
        expect(buttons(row({ state: 'Processing', actions: [] }))).toEqual([]);
    });

    it('renders View log and Cancel for an active task its owner reads', () => {
        expect(buttons(row({ state: 'Processing', actions: ['viewLog', 'cancel'] }))).toEqual(['View log', 'Cancel']);
    });

    it('renders Retry with what it does, and Delete, for a failed task', () => {
        const tr = row({ state: 'Failed', actions: ['viewLog', 'retry', 'delete'] });
        expect(buttons(tr)).toEqual(['View log', 'Retry', 'Delete from history']);
        expect(tr.find('button[aria-label="Retry"]').attributes('title')).toBe('Run again from the beginning');
    });

    it('emits the action with the row', async () => {
        const tr = row({ state: 'Processing', actions: ['viewLog', 'cancel'] });
        await tr.find('button[aria-label="Cancel"]').trigger('click');
        expect(wrapper.emitted('cancel')[0][0]).toMatchObject({ taskId: 't1' });
    });
});

describe('TasksTable, what a row names and shows', () => {
    it('shows the label of the target, not "Whole dataset"', () => {
        const tr = row({ state: 'Enqueued', targetLabel: 'limit-1 · images/ → photogrammetry_output (Fast Orthophoto)', path: null });
        expect(tr.find('.path-details').text()).toBe('limit-1 · images/ → photogrammetry_output (Fast Orthophoto)');
        expect(tr.text()).not.toContain('Whole dataset');
        expect(row({ state: 'Enqueued', path: null }).find('.path-details').exists()).toBe(false);
    });

    it('shows a cancelled task as Cancelled with the percent it had reached', () => {
        const tr = row({ state: 'Deleted', cancelledBy: 'admin', progressPercent: 42 });
        const [state, progress] = [tr.findAll('td')[0], tr.findAll('td')[2]];
        expect(state.find('.p-tag').attributes('aria-label')).toBe('Cancelled');
        expect(progress.text()).toContain('Cancelled at 42 %');
    });

    it('keeps "Deleted" for a task nobody cancelled', () => {
        const tr = row({ state: 'Deleted', cancelledBy: null, progressPercent: 42 });
        expect(tr.findAll('td')[0].find('.p-tag').attributes('aria-label')).toBe('Deleted');
        expect(tr.text()).not.toContain('Cancelled');
    });

    it('shows a task queued on a processing node as waiting, with no bar', () => {
        const tr = row({ state: 'Processing', waitingForNode: true, startedAt: '2026-11-09T10:00:00Z' });
        const cells = tr.findAll('td');
        expect(cells[0].find('.p-tag').attributes('aria-label')).toBe('Queued on node');
        expect(cells[2].text()).toContain('Queued on node');
        expect(cells[2].find('.p-progressbar').exists()).toBe(false);
        expect(tr.find('.duration.running').text()).toContain('waiting');
    });
});

/**
 * HeavyTaskStatus (FR-XC-15): the one status of a tool dialog's task: queued, running with phase and percent, done,
 * failed with the task's message.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import HeavyTaskStatus from './HeavyTaskStatus.vue';

const show = props => mount(HeavyTaskStatus, { props, global: { plugins: [PrimeVue] } });

describe('HeavyTaskStatus', () => {
    it('renders nothing without a task and without an error', () => {
        expect(show({ task: null }).find('[data-testid="heavy-task-status"]').exists()).toBe(false);
    });

    it('is a status region for a task in progress, named by its label', () => {
        const w = show({ task: { state: 'Enqueued', percent: 0 }, label: 'Merge' });
        expect(w.find('[role="status"]').exists()).toBe(true);
        expect(w.find('[data-testid="heavy-task-status"]').text()).toBe('MergeQueued…');
        expect(w.find('[role="progressbar"]').exists()).toBe(false);
        expect(w.find('[role="alert"]').exists()).toBe(false);
    });

    it('keeps one status region from the start to the end, so what appears in it is announced', async () => {
        const w = show({ task: null, label: 'Merge' });
        const region = w.find('[role="status"]');
        expect(region.exists()).toBe(true);
        expect(region.text()).toBe('');
        const element = region.element;

        await w.setProps({ task: { state: 'Processing', percent: 10 } });
        await w.setProps({ task: { state: 'Failed', error: 'Out of memory' } });
        expect(w.findAll('[role="status"]')).toHaveLength(1);
        expect(w.find('[role="status"]').element).toBe(element);
    });

    it('reads the state whole and keeps the percent out of what is announced', () => {
        const w = show({ task: { state: 'Processing', phase: 'Merging bands', percent: 42 }, label: 'Merge' });
        const state = w.find('[aria-atomic="true"]');
        expect(state.text()).toBe('MergeMerging bands');
        expect(w.findAll('[aria-atomic]')).toHaveLength(1);
        const percent = w.find('.heavy-task-percent');
        expect(percent.text()).toBe('42%');
        expect(percent.attributes('aria-hidden')).toBe('true');
        expect(state.element.contains(percent.element)).toBe(false);
    });

    it('shows the phase, the percent and a bar while it runs', () => {
        const w = show({ task: { state: 'Processing', phase: 'Merging bands', percent: 42 }, label: 'Merge' });
        expect(w.text()).toBe('MergeMerging bands42%');
        const bar = w.find('[role="progressbar"]');
        expect(bar.attributes('aria-valuenow')).toBe('42');
        expect(bar.attributes('aria-label')).toBe('Merge progress');
    });

    it('puts the reason of a failure in its own alert, inside the status region, with no bar and no percent', () => {
        const w = show({ task: { state: 'Failed', percent: 100, error: 'The output is one of the source bands' }, label: 'Merge' });
        const alert = w.find('[role="alert"]');
        expect(alert.text()).toBe('The output is one of the source bands');
        expect(alert.attributes('data-testid')).toBe('heavy-task-error');
        expect(w.find('[role="status"]').element.contains(alert.element)).toBe(true);
        // The state words are not in the alert
        expect(w.find('[aria-atomic="true"]').text()).toBe('MergeFailed');
        expect(w.text()).not.toContain('100%');
        expect(w.find('[role="progressbar"]').exists()).toBe(false);
    });

    it('shows the failure of a task whose dataset is gone, not a spinner', () => {
        const w = show({ task: { state: 'Processing', percent: 40, error: 'The dataset was deleted.', datasetGone: true }, label: 'Merge' });
        expect(w.find('[role="alert"]').text()).toBe('The dataset was deleted.');
        expect(w.find('[role="progressbar"]').exists()).toBe(false);
        expect(w.find('.fa-spin').exists()).toBe(false);
        expect(w.text()).not.toContain('Running');
    });

    it('shows the error of the dialog as a failure while its task is still running', () => {
        const w = show({ task: { state: 'Processing', percent: 40 }, error: 'The connection was lost', label: 'Merge' });
        expect(w.find('[role="alert"]').text()).toBe('The connection was lost');
        expect(w.find('[role="progressbar"]').exists()).toBe(false);
        expect(w.find('.fa-spin').exists()).toBe(false);
    });

    it('shows a refusal of the submit as a failure', () => {
        const w = show({ task: null, error: 'Another task writes this output', label: 'Align' });
        expect(w.text()).toBe('AlignFailedAnother task writes this output');
    });

    it('reads the phase in the words the dialog gives', () => {
        const w = show({ task: { state: 'Processing', phase: 'extracting', percent: 5 }, phases: { extracting: 'Extracting files…' } });
        expect(w.text()).toContain('Extracting files…');
    });

    it('follows the task it is given, without keeping a copy', async () => {
        const task = { state: 'Enqueued', percent: 0 };
        const w = show({ task });
        expect(w.text()).toBe('Queued…');
        await w.setProps({ task: { state: 'Succeeded', percent: 100 } });
        expect(w.text()).toBe('Done');
    });

    describe('Cancel', () => {
        const cancelButton = w => w.find('[data-testid="heavy-task-cancel"]');

        it('is not offered unless the dialog asks for it', () => {
            expect(cancelButton(show({ task: { state: 'Processing', percent: 5 } })).exists()).toBe(false);
        });

        it.each([
            ['queued', { state: 'Enqueued' }],
            ['waiting for a node', { state: 'Processing', waitingForNode: true }],
            ['running', { state: 'Processing', percent: 5 }]
        ])('is offered for a task that is %s, and emits cancel with the task', async (_name, task) => {
            const w = show({ task, cancellable: true, label: 'Merge' });
            const button = cancelButton(w);
            expect(button.exists()).toBe(true);
            expect(button.attributes('aria-label')).toBe('Cancel Merge');
            await button.trigger('click');
            expect(w.emitted('cancel')).toEqual([[task]]);
        });

        it.each([
            ['done', { task: { state: 'Succeeded' } }],
            ['failed', { task: { state: 'Failed', error: 'x' } }],
            ['cancelled', { task: { state: 'Deleted', cancelledBy: 'admin' } }],
            ['a dataset that is gone', { task: { state: 'Processing', datasetGone: true } }],
            ['a refusal of the submit', { task: null, error: 'Another task writes this output' }],
            ['nothing', { task: null }]
        ])('is not offered for %s', (_name, props) => {
            expect(cancelButton(show({ ...props, cancellable: true })).exists()).toBe(false);
        });

        it('follows the actions the server gives the task: no Cancel without cancel, Cancel with it', () => {
            expect(cancelButton(show({ task: { state: 'Processing', percent: 5, actions: ['viewLog'] }, cancellable: true })).exists()).toBe(false);
            expect(cancelButton(show({ task: { state: 'Processing', percent: 5, actions: ['viewLog', 'cancel'] }, cancellable: true })).exists()).toBe(true);
        });

        it('waits while a cancel is being asked', () => {
            const w = show({ task: { state: 'Processing', percent: 5 }, cancellable: true, cancelling: true });
            expect(cancelButton(w).element.disabled).toBe(true);
        });
    });
});

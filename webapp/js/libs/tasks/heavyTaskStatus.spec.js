/**
 * What a tool dialog says about its task (FR-XC-15, FR-XC-06): queued, running with the phase and the percent, done,
 * failed with the task's message and no progress, cancelled.
 */
import { describe, it, expect } from 'vitest';
import { describeHeavyTask, FAILED_WITHOUT_MESSAGE } from './heavyTaskStatus';

describe('describeHeavyTask', () => {
    it('says nothing without a task and without an error', () => {
        expect(describeHeavyTask(null)).toBeNull();
        expect(describeHeavyTask(undefined, { error: '' })).toBeNull();
    });

    it('shows a refusal of the submit, which has no task, as a failure with its reason', () => {
        expect(describeHeavyTask(null, { error: 'Another task writes this output' })).toMatchObject({
            kind: 'failed', text: 'Failed', error: 'Another task writes this output', percent: ''
        });
    });

    it.each(['Enqueued', 'Processing'])('shows a task of a deleted dataset (last state %s) as failed with its reason, not as running or queued', state => {
        const view = describeHeavyTask({ state, percent: 40, phase: 'Merging', error: 'The dataset was deleted.', datasetGone: true });
        expect(view).toMatchObject({ kind: 'failed', text: 'Failed', percent: '', value: null, error: 'The dataset was deleted.' });
    });

    it.each(['Enqueued', 'Processing'])('shows the error of the dialog as a failure while the task is still %s', state => {
        const view = describeHeavyTask({ state, percent: 40, phase: 'Merging' }, { error: 'The connection was lost' });
        expect(view).toMatchObject({ kind: 'failed', text: 'Failed', percent: '', value: null, error: 'The connection was lost' });
    });

    it.each(['Enqueued', 'Created', 'Awaiting', 'Scheduled'])('shows %s as queued', state => {
        expect(describeHeavyTask({ state, percent: 0 })).toMatchObject({ kind: 'queued', text: 'Queued…', percent: '', value: null, title: '' });
    });

    it('shows a task that a processing node holds as queued, with the reason, even when its state is Processing', () => {
        expect(describeHeavyTask({ state: 'Processing', waitingForNode: true, percent: 0 })).toMatchObject({
            kind: 'queued', text: 'Queued…', title: 'Queued on node: it starts when the processing node is free'
        });
        // The flag of a task that ended says nothing
        expect(describeHeavyTask({ state: 'Succeeded', waitingForNode: true }).kind).toBe('done');
    });

    it('shows a running task by its phase and its percent', () => {
        expect(describeHeavyTask({ state: 'Processing', phase: 'Merging bands', percent: 42 })).toMatchObject({
            kind: 'running', text: 'Merging bands', percent: '42%', value: 42
        });
        expect(describeHeavyTask({ state: 'Processing', percent: 0 })).toMatchObject({ kind: 'running', text: 'Running…', percent: '', value: null });
        expect(describeHeavyTask({ state: 'Processing', percent: 250 }).value).toBe(100);
    });

    it('says the phase in the words the dialog gives, else as the server sent it', () => {
        const phases = { extracting: 'Extracting files…' };
        expect(describeHeavyTask({ state: 'Processing', phase: 'extracting' }, { phases }).text).toBe('Extracting files…');
        expect(describeHeavyTask({ state: 'Processing', phase: 'Reading images' }, { phases }).text).toBe('Reading images');
    });

    it('treats Indexing, Reused and a state it does not know as running', () => {
        for (const state of ['Indexing', 'Reused', 'SomethingNew']) expect(describeHeavyTask({ state, percent: 10 }).kind).toBe('running');
    });

    it('shows a succeeded task as done, without a percent', () => {
        expect(describeHeavyTask({ state: 'Succeeded', percent: 100 })).toMatchObject({ kind: 'done', text: 'Done', percent: '', value: null });
    });

    it('shows a failed task with the message of the task and never a progress', () => {
        const view = describeHeavyTask({ state: 'Failed', percent: 100, phase: 'Merging', error: 'The output is one of the source bands' });
        expect(view).toMatchObject({ kind: 'failed', text: 'Failed', error: 'The output is one of the source bands', percent: '', value: null });
        expect(describeHeavyTask({ state: 'Failed', error: null }).error).toBe(FAILED_WITHOUT_MESSAGE);
        expect(FAILED_WITHOUT_MESSAGE).toBe('The task failed.');
    });

    it('shows a Deleted task as Cancelled when a user cancelled it', () => {
        expect(describeHeavyTask({ state: 'Deleted', cancelledBy: 'ann' })).toMatchObject({ kind: 'cancelled', text: 'Cancelled', title: 'Cancelled by ann' });
        expect(describeHeavyTask({ state: 'Deleted' })).toMatchObject({ kind: 'cancelled', text: 'Deleted', title: '' });
    });
});

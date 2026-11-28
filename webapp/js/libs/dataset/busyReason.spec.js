/**
 * The words of a busy dataset (an import or a rescan of its index runs): the tag of its row, why it does not open, what its
 * delete does first, and its page state.
 */
import { describe, it, expect } from 'vitest';
import { busyLabel, busyBlockReason, busyDeleteWarning, busyPageText, busyCancelLabel, busyTaskName } from './busyReason';

const importing = progress => ({ kind: 'importing', taskId: 't1', progress });
const rescanning = progress => ({ kind: 'rescanning', taskId: 't2', progress });

describe('busyReason', () => {
    it('labels the row with the kind and the progress, whole percents, none before the first one', () => {
        expect(busyLabel(importing(40))).toBe('Importing… 40 %');
        expect(busyLabel(importing(39.6))).toBe('Importing… 40 %');
        expect(busyLabel(rescanning(null))).toBe('Rescanning…');
        expect(busyLabel(rescanning(0))).toBe('Rescanning…');
    });

    it('says why the dataset does not open, and nothing for a dataset that is not busy', () => {
        expect(busyBlockReason(importing(1))).toBe('The dataset is being imported');
        expect(busyBlockReason(rescanning(1))).toBe('The dataset is being rescanned');
        expect(busyBlockReason(null)).toBeNull();
        expect(busyBlockReason(undefined)).toBeNull();
    });

    it('says that the delete stops the task first', () => {
        expect(busyDeleteWarning(importing(1))).toBe('The import stops first, then the dataset and all its files are deleted.');
        expect(busyDeleteWarning(rescanning(1))).toBe('The rescan stops first, then the dataset and all its files are deleted.');
        expect(busyDeleteWarning(null)).toBeNull();
    });

    it('gives the page state its heading and its text', () => {
        expect(busyPageText(importing(null), 'site')).toEqual({
            heading: 'This dataset is being imported',
            text: '"site" opens when the import ends. Until then it can only be deleted.'
        });
        expect(busyPageText(rescanning(5), '').text).toBe('The dataset opens when the rescan ends. Until then it can only be deleted.');
    });

    it('names the cancel of the task and the task itself', () => {
        expect(busyCancelLabel(importing(1))).toBe('Cancel import');
        expect(busyCancelLabel(rescanning(1))).toBe('Cancel rescan');
        expect(busyTaskName(importing(1))).toBe('Dataset import');
        expect(busyTaskName(rescanning(1))).toBe('Index rescan');
    });

    it('says a dataset whose import was cancelled is being deleted, with no task that its delete would stop', () => {
        const deleting = { kind: 'deleting', taskId: 't1', progress: null };
        expect(busyLabel(deleting)).toBe('Deleting…');
        expect(busyBlockReason(deleting)).toBe('The dataset is being deleted');
        expect(busyDeleteWarning(deleting)).toBeNull();
        expect(busyPageText(deleting, 'site')).toEqual({
            heading: 'This dataset is being deleted', text: '"site" is deleted because its import was cancelled.'
        });
    });

    it('has plain words for a kind this Hub does not know', () => {
        const other = { kind: 'compacting', taskId: 't3', progress: 10 };
        expect(busyLabel(other)).toBe('Updating… 10 %');
        expect(busyBlockReason(other)).toBe('The dataset is being updated');
        expect(busyDeleteWarning(other)).toBe('The task stops first, then the dataset and all its files are deleted.');
        expect(busyCancelLabel(other)).toBe('Cancel task');
    });
});

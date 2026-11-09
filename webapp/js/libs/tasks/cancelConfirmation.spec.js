/**
 * The cancel question of a task (FR-UPL-05, D-004): the cancel of a tool that adds files (imports,
 * archive extraction, multispectral merge, raster alignment, photogrammetry) says what is deleted:
 * the files or output so far, and the dataset that an import of a dataset (or photogrammetry, when it
 * made one) created. Any other task keeps the plain question. It is a destructive confirmation.
 */
import { describe, it, expect } from 'vitest';
import { cancelConfirmation, cancelDialogProps, cancelRollbackNote } from './cancelConfirmation';

describe('cancelConfirmation', () => {
    it('says that an import of a dataset deletes the files imported so far and the dataset it created', () => {
        const q = cancelConfirmation({ toolId: 'import-dataset', path: null }, 'Import dataset');
        expect(q).toMatchObject({ title: 'Cancel Task', confirmText: 'Cancel Task', cancelText: "Don't Cancel", danger: true });
        expect(q.message).toContain('<strong>Import dataset</strong> will be stopped.');
        expect(q.warningTitle).toBe('This cannot be undone.');
        expect(q.warningMessage).toBe('The files imported so far are deleted, and so is the dataset that this import created.');
    });

    it('says that a file import deletes the files imported so far, and not a dataset', () => {
        const q = cancelConfirmation({ toolId: 'import-file', path: 'a/b.tif' }, 'Import file');
        expect(q.warningMessage).toBe('The files imported so far are deleted.');
        expect(q.message).toContain('(path: a/b.tif)');
    });

    it('says what the other tools that add files delete: extracted files, output, and the dataset photogrammetry created', () => {
        expect(cancelConfirmation({ toolId: 'archive-extract', path: 'a.zip' }, 'Extract').warningMessage)
            .toBe('The files extracted so far are deleted.');
        expect(cancelConfirmation({ toolId: 'merge-multispectral' }, 'Merge').warningMessage)
            .toBe('The output written so far is deleted.');
        expect(cancelConfirmation({ toolId: 'align-raster' }, 'Align').warningMessage)
            .toBe('The output written so far is deleted.');
        const q = cancelConfirmation({ toolId: 'photogrammetry' }, 'Photogrammetry');
        expect(q.warningTitle).toBe('This cannot be undone.');
        expect(q.warningMessage).toBe('The output written so far is deleted, and so is the dataset, if this task created it.');
    });

    it('keeps the plain question for a task that adds no files', () => {
        for (const toolId of ['build', 'rescan-index', 'raster-export', 'bulk-download', 'splat-training-export', undefined, 'constructor']) {
            const q = cancelConfirmation({ toolId }, 'Build');
            expect(q.warningMessage).toBeUndefined();
            expect(q.warningTitle).toBeUndefined();
            expect(q.danger).toBe(true);
            expect(cancelRollbackNote({ toolId })).toBe('');
        }
    });

    it('names the task by the label its tool gives it, before its path (FR-PRC-22)', () => {
        const q = cancelConfirmation({ toolId: 'photogrammetry', path: null, targetLabel: 'limit-1 · images/ → out (Fast Orthophoto)' }, 'Photogrammetry');
        expect(q.message).toBe('Are you sure you want to cancel this task?<br/><strong>Photogrammetry</strong> (limit-1 · images/ → out (Fast Orthophoto)) will be stopped.');
        expect(cancelConfirmation({ toolId: 'merge-multispectral', path: 'a.tif', targetLabel: '→ <b>.tif' }, 'Merge').message)
            .toContain('(→ &lt;b&gt;.tif)');
    });

    it('escapes the tool title and the path, which come from the user', () => {
        const q = cancelConfirmation({ toolId: 'build', path: '<img src=x>' }, '<b>x</b>');
        expect(q.message).not.toContain('<img');
        expect(q.message).not.toContain('<b>x</b>');
    });

    it('gives the same question as ConfirmDialog props, with the danger button', () => {
        const props = cancelDialogProps({ toolId: 'import-dataset' }, 'Import dataset');
        expect(props).toMatchObject({ confirmButtonClass: 'danger', cancelText: "Don't Cancel" });
        expect(props).not.toHaveProperty('danger');
        expect(props.warningMessage).toContain('the dataset that this import created');
    });
});

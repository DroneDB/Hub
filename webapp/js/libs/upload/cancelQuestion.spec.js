import { describe, it, expect } from 'vitest';
import { cancelUploadQuestion } from './cancelQuestion';

describe('cancelUploadQuestion', () => {
    it('/upload says that nothing is kept: the dataset and the files sent are deleted', () => {
        expect(cancelUploadQuestion({ sent: 2, discardsBatch: true }).message)
            .toBe('Stop the upload? The dataset and the 2 files already sent are deleted.');
        expect(cancelUploadQuestion({ sent: 1, discardsBatch: true }).message)
            .toBe('Stop the upload? The dataset and the 1 file already sent are deleted.');
        expect(cancelUploadQuestion({ sent: 0, discardsBatch: true }).message).toBe('Stop the upload? The dataset is deleted.');
    });

    it('the dataset page says that the files sent stay (D-045)', () => {
        expect(cancelUploadQuestion({ sent: 3, discardsBatch: false }).message)
            .toBe('Stop the upload? The 3 files already sent stay in the dataset.');
        expect(cancelUploadQuestion({ sent: 1, discardsBatch: false }).message)
            .toBe('Stop the upload? The 1 file already sent stays in the dataset.');
        expect(cancelUploadQuestion({ sent: 0, discardsBatch: false }).message)
            .toBe('Stop the upload? No file has been added to the dataset yet.');
    });

    it('is a destructive confirmation with a button for each answer', () => {
        expect(cancelUploadQuestion({ sent: 1, discardsBatch: true })).toMatchObject({
            danger: true, confirmText: 'Stop upload', cancelText: 'Keep uploading'
        });
    });
});

import { describe, it, expect } from 'vitest';
import { finishWithoutLabel, finishWithoutQuestion } from './finishQuestion';

describe('finishWithoutQuestion', () => {
    it('names the failed files on the button', () => {
        expect(finishWithoutLabel(1)).toBe('Finish without the 1 failed file');
        expect(finishWithoutLabel(3)).toBe('Finish without the 3 failed files');
    });

    it('says what the dataset gets and what is left out', () => {
        expect(finishWithoutQuestion({ failed: 2, uploaded: 5 }).message)
            .toBe('The 5 files uploaded are added to the dataset. The 2 failed files are left out.');
        expect(finishWithoutQuestion({ failed: 1, uploaded: 1 }).message)
            .toBe('The 1 file uploaded is added to the dataset. The 1 failed file is left out.');
    });

    it('is not a destructive confirmation: nothing is deleted', () => {
        expect(finishWithoutQuestion({ failed: 1, uploaded: 1 }).danger).toBeUndefined();
    });
});

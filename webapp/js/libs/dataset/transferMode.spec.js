import { describe, it, expect } from 'vitest';
import { transferModeFor, transferModeOf, TRANSFER_MODES } from './transferMode';

describe('the transfer a user gets', () => {
    it('moves the files for a writer: the server does not keep the source', () => {
        expect(transferModeFor(true)).toBe(TRANSFER_MODES.move);
        expect(TRANSFER_MODES.move.keepSource).toBe(false);
    });

    it('copies them for a user who can only read the dataset, and says so', () => {
        const mode = transferModeFor(false);
        expect(mode).toBe(TRANSFER_MODES.copy);
        expect(mode.keepSource).toBe(true);
        expect(mode.menuLabel).toMatch(/^Copy/);
        expect(mode.confirmLabel).toBe('Copy');
        expect(mode.note).toMatch(/stay here/);
    });

    it('is found again from the server parameter', () => {
        expect(transferModeOf(true)).toBe(TRANSFER_MODES.copy);
        expect(transferModeOf(false)).toBe(TRANSFER_MODES.move);
    });
});

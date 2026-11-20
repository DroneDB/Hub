/**
 * The visibility options and the default of every form that picks one (FR-UPL-02, D-009): Private first and the
 * default; the task parameters carry the name.
 */
import { describe, it, expect } from 'vitest';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY, visibilityName, visibilityLabel } from './visibility';

describe('VISIBILITY_OPTIONS', () => {
    it('lists Private, Unlisted and Public, with the values of the Registry (0, 1, 2)', () => {
        expect(VISIBILITY_OPTIONS.map(o => ({ ...o }))).toEqual([
            { value: 0, label: 'Private' },
            { value: 1, label: 'Unlisted' },
            { value: 2, label: 'Public' }
        ]);
    });

    it('is frozen: a form cannot change the list of the others', () => {
        expect(Object.isFrozen(VISIBILITY_OPTIONS)).toBe(true);
        expect(Object.isFrozen(VISIBILITY_OPTIONS[0])).toBe(true);
    });
});

describe('DEFAULT_VISIBILITY', () => {
    it('is Private (D-009)', () => {
        expect(DEFAULT_VISIBILITY).toBe(0);
        expect(visibilityLabel(DEFAULT_VISIBILITY)).toBe('Private');
    });
});

describe('visibilityName', () => {
    it('is the name the task parameters carry', () => {
        expect([0, 1, 2].map(visibilityName)).toEqual(['PRIVATE', 'UNLISTED', 'PUBLIC']);
    });

    it('is the default for an unknown or missing visibility', () => {
        expect(visibilityName(undefined)).toBe('PRIVATE');
        expect(visibilityName(7)).toBe('PRIVATE');
    });
});

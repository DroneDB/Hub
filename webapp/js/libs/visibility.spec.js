/**
 * The visibility options and the default of every form that picks one: Private first and the
 * default; the task parameters carry the name.
 */
import { describe, it, expect } from 'vitest';
import { VISIBILITY_OPTIONS, DEFAULT_VISIBILITY, visibilityName, visibilityLabel, visibilityDescription, visibilityChangeConfirmation } from './visibility';

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
    it('is Private', () => {
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

describe('visibilityDescription', () => {
    it('says who can see the data, one sentence per visibility', () => {
        expect(visibilityDescription(0)).toBe('Only members of the organization can see and download the data.');
        expect(visibilityDescription(1)).toContain('Anyone with the link');
        expect(visibilityDescription(1)).toContain('not listed');
        expect(visibilityDescription(2)).toContain('Listed and discoverable');
    });

    it('is the one of Private for an unknown or missing visibility, as the tag shows it', () => {
        expect(visibilityDescription(undefined)).toBe(visibilityDescription(0));
        expect(visibilityDescription(7)).toBe(visibilityDescription(0));
    });
});

describe('visibilityChangeConfirmation', () => {
    it('names the dataset, the visibility it has and the one it gets, and what that means', () => {
        const q = visibilityChangeConfirmation({ name: 'Brighton', from: 0, to: 2 });
        expect(q.title).toBe('Make the dataset Public?');
        expect(q.confirmText).toBe('Make Public');
        expect(q.cancelText).toBe('Cancel');
        expect(q.message).toBe('This changes the visibility of the dataset <strong>Brighton</strong> from Private to Public. ' +
            visibilityDescription(2));
    });

    it('asks in the other direction too: back to Private', () => {
        const q = visibilityChangeConfirmation({ name: 'Brighton', from: 2, to: 0 });
        expect(q.title).toBe('Make the dataset Private?');
        expect(q.confirmText).toBe('Make Private');
        expect(q.message).toContain('from Public to Private');
    });

    it('escapes the name, which comes from the user, and the note', () => {
        const q = visibilityChangeConfirmation({ name: '<img src=x onerror=alert(1)>', from: 0, to: 1, note: 'A & B' });
        expect(q.message).not.toContain('<img');
        expect(q.message).toContain('&lt;img src=x onerror=alert(1)&gt;');
        expect(q.message.endsWith(' A &amp; B')).toBe(true);
    });
});

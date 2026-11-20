import { describe, it, expect } from 'vitest';
import { selectableUser, successorChoices, bulkSummary, sumDeleteResults } from './userBulk';

describe('selectableUser (FR-ADM-23)', () => {
    it('is every user but the built-in admin', () => {
        expect(selectableUser({ userName: 'alice' })).toBe(true);
        expect(selectableUser({ userName: 'admin' })).toBe(false);
    });
});

describe('successorChoices', () => {
    const users = [
        { userName: 'admin', roles: ['admin'] },
        { userName: 'alice', roles: ['editor'] },
        { userName: 'bob', roles: [] },
        { userName: 'carol', roles: ['viewer', 'deactivated'] },
        { userName: 'dave', roles: ['Deactivated'] }
    ];

    it('leaves out every user being deleted and every disabled user', () => {
        expect(successorChoices(users, ['alice', 'bob']).map(c => c.value)).toEqual(['admin']);
        expect(successorChoices(users, ['alice']).map(c => c.value)).toEqual(['admin', 'bob']);
    });

    it('offers all but the disabled when nobody is deleted, as label and value', () => {
        expect(successorChoices(users, [])).toEqual([
            { label: 'admin', value: 'admin' }, { label: 'alice', value: 'alice' }, { label: 'bob', value: 'bob' }
        ]);
    });
});

describe('bulkSummary', () => {
    it('reports what succeeded, and what failed with the message of the Registry', () => {
        expect(bulkSummary('Disabled', { done: ['a', 'b'], failed: [] })).toBe('Disabled 2 users.');
        expect(bulkSummary('Disabled', { done: ['a'], failed: [{ userName: 'bob', message: 'Cannot disable your own account' }] }))
            .toBe('Disabled 1 user. 1 failed: bob (Cannot disable your own account).');
        expect(bulkSummary('Added the role editor to', { done: ['a'], failed: [], skipped: ['b', 'c'] }))
            .toBe('Added the role editor to 1 user. Already so for b, c.');
    });
});

describe('sumDeleteResults', () => {
    it('adds up what each delete did, and names the successor', () => {
        expect(sumDeleteResults([
            { userName: 'a', organizationsTransferred: 1, datasetsTransferred: 4, batchesDeleted: 2 },
            { userName: 'b', organizationsTransferred: 2, datasetsTransferred: 1 },
            null
        ], 'carol')).toEqual({
            successor: 'carol', organizationsTransferred: 3, organizationsDeleted: 0, datasetsTransferred: 5, datasetsDeleted: 0, batchesDeleted: 2
        });
        expect(sumDeleteResults([{ datasetsDeleted: 7 }], null).successor).toBeNull();
    });
});

import { describe, it, expect } from 'vitest';
import { actionsOfAnyRow } from './rowActions';

describe('actionsOfAnyRow', () => {
    const actions = { edit: row => row.write, delete: row => row.del, share: () => false };

    it('marks an action that at least one row has, and not one that no row has', () => {
        expect(actionsOfAnyRow([{ write: true }, { del: true }], actions)).toEqual({ edit: true, delete: true, share: false });
    });

    it('marks none for an empty list', () => {
        expect(actionsOfAnyRow([], actions)).toEqual({ edit: false, delete: false, share: false });
    });
});

import { describe, it, expect } from 'vitest';
import { DEFAULT_LIST_VIEW, LIST_VIEWS, LIST_VIEW_OPTIONS } from './listViews';

describe('list views', () => {
    it('are the list and the map, and open in the list', () => {
        expect(LIST_VIEWS).toEqual(['list', 'map']);
        expect(DEFAULT_LIST_VIEW).toBe('list');
        expect(LIST_VIEW_OPTIONS.map(o => o.value)).toEqual([...LIST_VIEWS]);
        expect(LIST_VIEW_OPTIONS.every(o => o.label && o.icon)).toBe(true);
    });
});

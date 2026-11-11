/**
 * The rows follow another item size even when their count stays the same (the thumbnail size of the explorer grid,
 * FR-EXP-43): a row placed at the old size would overlap the next one.
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import VirtualScroller from './VirtualScroller.vue';

describe('VirtualScroller', () => {
    it('places the rows again at a new item size: 5 rows of 100 px are 500 px, of 200 px 1000 px', async () => {
        const w = mount(VirtualScroller, { props: { items: [1, 2, 3, 4, 5], itemSize: 100 } });
        const inner = () => w.find('.virtual-scroller > div').attributes('style');
        expect(inner()).toContain('height: 500px');
        await w.setProps({ itemSize: 200 });
        expect(inner()).toContain('height: 1000px');
        w.unmount();
    });
});

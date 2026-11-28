/**
 * The rows follow another item size even when their count stays the same (the thumbnail size of the explorer grid,
 * FR-EXP-43): a row placed at the old size would overlap the next one.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
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

    // A row with a state of its own (an expanded error text): it must stay with its item when rows come and go
    const Row = defineComponent({
        props: { item: { type: Object, required: true } },
        setup(props) {
            const expanded = ref(false);
            return () => h('button', { class: 'row', 'data-id': props.item.id, onClick: () => { expanded.value = !expanded.value; } },
                `${props.item.id}:${expanded.value ? 'open' : 'closed'}`);
        }
    });
    // happy-dom lays nothing out: the scroll element gets a height, so the virtualizer has rows to draw
    beforeEach(() => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 300, height: 400, top: 0, left: 0, right: 300, bottom: 400, x: 0, y: 0 });
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(400);
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    });
    afterEach(() => vi.restoreAllMocks());
    // Mounted and drawn: the virtualizer learns the height of the scroll element after the mount
    async function mountRows(items, extra = {}) {
        const w = mount(VirtualScroller, {
            props: { items, itemSize: 40, ...extra },
            slots: { default: ({ item }) => h(Row, { item }) }
        });
        await flushPromises();
        return w;
    }
    const texts = w => w.findAll('.row').map(r => r.text());

    it('keeps the state of a row with its item when an item before it is removed (keyed by itemKey)', async () => {
        const w = await mountRows([{ id: 'a' }, { id: 'b' }, { id: 'c' }], { itemKey: 'id' });
        expect(texts(w)).toEqual(['a:closed', 'b:closed', 'c:closed']);
        await w.findAll('.row')[1].trigger('click');
        expect(texts(w)).toEqual(['a:closed', 'b:open', 'c:closed']);

        await w.setProps({ items: [{ id: 'b' }, { id: 'c' }] });

        expect(texts(w)).toEqual(['b:open', 'c:closed']);
        w.unmount();
    });

    it('accepts a function for the key', async () => {
        const w = await mountRows([{ id: 'a' }, { id: 'b' }], { itemKey: item => `row-${item.id}` });
        await w.findAll('.row')[1].trigger('click');

        await w.setProps({ items: [{ id: 'b' }] });

        expect(texts(w)).toEqual(['b:open']);
        w.unmount();
    });

    it('follows items that change place with the same count: each row shows its own state', async () => {
        const w = await mountRows([{ id: 'a' }, { id: 'b' }], { itemKey: 'id' });
        await w.findAll('.row')[0].trigger('click');

        await w.setProps({ items: [{ id: 'b' }, { id: 'a' }] });

        expect(texts(w)).toEqual(['b:closed', 'a:open']);
        w.unmount();
    });

    it('without itemKey rows are keyed by position, as before', async () => {
        const w = await mountRows([{ id: 'a' }, { id: 'b' }]);
        await w.findAll('.row')[0].trigger('click');

        await w.setProps({ items: [{ id: 'b' }] });

        // The state stayed with the position: the first row, now showing b
        expect(texts(w)).toEqual(['b:open']);
        w.unmount();
    });
});

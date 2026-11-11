/**
 * The size class of a map follows the size of the map, not the window (FR-MAP-12, FR-SHR-05): a phone, a narrow pane
 * and the default 600 x 400 frame of an embed are all handled by the same rule.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, h, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { mapSizeOf, SHORT_MAP_PX } from './mapSize';
import { useMapSize } from '@/composables/useMapSize';

describe('mapSizeOf', () => {
    it('is narrow below sm (576 px), from 575 px down', () => {
        expect(mapSizeOf(390, 844)).toMatchObject({ narrow: true, short: false, compact: true });
        expect(mapSizeOf(575, 844).narrow).toBe(true);
        expect(mapSizeOf(576, 844)).toMatchObject({ narrow: false, short: false, compact: false });
    });

    it('is short below 560 px high, so the default 600 x 400 embed frame is compact without being narrow', () => {
        expect(SHORT_MAP_PX).toBe(560);
        expect(mapSizeOf(600, 400)).toMatchObject({ narrow: false, short: true, compact: true });
        expect(mapSizeOf(600, 559).short).toBe(true);
        expect(mapSizeOf(600, 560).short).toBe(false);
    });

    it('is none of them on a desktop map', () => {
        expect(mapSizeOf(1280, 800)).toMatchObject({ narrow: false, short: false, compact: false });
    });

    it('knows nothing about a map that has no size yet (not laid out)', () => {
        expect(mapSizeOf(0, 0)).toMatchObject({ narrow: false, short: false, compact: false });
    });
});

describe('useMapSize', () => {
    const original = globalThis.ResizeObserver;
    afterEach(() => { globalThis.ResizeObserver = original; });

    /** A ResizeObserver whose callbacks the test fires */
    function observer() {
        const observers = [];
        globalThis.ResizeObserver = class {
            constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        };
        return observers;
    }
    const mountWith = (element) => {
        let size;
        const wrapper = mount(defineComponent({
            setup() {
                const map = useMapSize();
                size = map.size;
                map.observe(element);
                return () => h('div');
            }
        }));
        return { wrapper, size };
    };
    const box = (width, height) => {
        const element = document.createElement('div');
        Object.defineProperty(element, 'clientWidth', { value: width });
        Object.defineProperty(element, 'clientHeight', { value: height });
        return element;
    };

    it('reads the container when it starts, and follows it when it is resized', async () => {
        const observers = observer();
        const { size } = mountWith(box(390, 800));
        expect(size).toMatchObject({ narrow: true, short: false, compact: true });
        observers[0].callback([{ contentRect: { width: 900, height: 400 } }]);
        await nextTick();
        expect(size).toMatchObject({ width: 900, height: 400, narrow: false, short: true, compact: true });
        observers[0].callback([{ contentRect: { width: 900, height: 700 } }]);
        expect(size.compact).toBe(false);
    });

    it('disconnects the observer with the component', () => {
        const observers = observer();
        const { wrapper } = mountWith(box(390, 800));
        wrapper.unmount();
        expect(observers[0].disconnected).toBe(true);
    });

    it('does nothing without an element or without a ResizeObserver', () => {
        const { size } = mountWith(null);
        expect(size.compact).toBe(false);
        globalThis.ResizeObserver = undefined;
        expect(mountWith(box(300, 300)).size.narrow).toBe(true);
    });
});

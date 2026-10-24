/**
 * Unit tests for libs/listenerBag.js and composables/useEventListener.js (HUB-08)
 * Run with: npx vitest run webapp/js/libs/listenerBag.spec.js
 */
import { describe, it, expect, vi } from 'vitest';
import { effectScope } from 'vue';
import { ListenerBag } from '@/libs/listenerBag';
import { useEventListener, useListenerBag } from '@/composables/useEventListener';
import mitt from 'mitt';

describe('ListenerBag', () => {
    it('removes DOM, OpenLayers and bus listeners on dispose', () => {
        const bag = new ListenerBag();
        const el = new EventTarget();
        const click = vi.fn();
        bag.add(el, 'click', click);

        const olTarget = { removeEventListener: vi.fn() };
        bag.ol({ target: olTarget, type: 'pointermove', listener: 'fn' });

        const bus = mitt();
        const onBus = vi.fn();
        bag.bus(bus, 'addItems', onBus);

        bag.dispose();
        el.dispatchEvent(new Event('click'));
        bus.emit('addItems');
        expect(click).not.toHaveBeenCalled();
        expect(onBus).not.toHaveBeenCalled();
        expect(olTarget.removeEventListener).toHaveBeenCalledWith('pointermove', 'fn');
        expect(bag.size).toBe(0);
    });

    it('removes one listener early, once', () => {
        const bag = new ListenerBag();
        const el = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
        const off = bag.add(el, 'click', () => {});
        off(); off(); bag.dispose();
        expect(el.removeEventListener).toHaveBeenCalledTimes(1);
    });
});

describe('useEventListener', () => {
    it('removes its listener when the scope is disposed', () => {
        const scope = effectScope();
        const el = new EventTarget();
        const onClick = vi.fn();
        scope.run(() => useEventListener(el, 'click', onClick));
        el.dispatchEvent(new Event('click'));
        scope.stop();
        el.dispatchEvent(new Event('click'));
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

describe('useListenerBag', () => {
    it('balances window listeners over 10 mounts and unmounts', () => {
        const add = vi.spyOn(window, 'addEventListener');
        const remove = vi.spyOn(window, 'removeEventListener');
        for (let i = 0; i < 10; i++) {
            const scope = effectScope();
            const listeners = scope.run(() => useListenerBag());
            listeners.add(window, 'resize', () => {});
            listeners.add(window, 'keydown', () => {});
            scope.stop();
        }
        expect(add.mock.calls.length).toBe(20);
        expect(remove.mock.calls.length).toBe(add.mock.calls.length);
        add.mockRestore();
        remove.mockRestore();
    });
});

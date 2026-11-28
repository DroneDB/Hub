/**
 * The open/close and keyboard behaviour of a menu button, with the two ways an item can be off: the real `disabled`
 * (left out of the items) and `aria-disabled` (focusable, so that its reason can be read).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, h, ref, nextTick } from 'vue';
import { mount } from '@vue/test-utils';
import { useMenu } from './useMenu';

let wrapper;
let api;
let beforeOpen;

/** A button and a menu of three items: the second is off, as `disabled` or as `aria-disabled` */
function render({ off = 'aria', ...options } = {}) {
    const Host = defineComponent({
        setup() {
            const root = ref(null);
            const trigger = ref(null);
            const list = ref(null);
            api = useMenu({ root, trigger, list, ...options });
            return () => h('div', { ref: root, 'data-testid': 'root', onFocusout: api.onFocusOut }, [
                h('button', { ref: trigger, type: 'button', 'data-testid': 'trigger', onClick: api.toggle, onKeydown: api.onKey }),
                api.open.value && h('div', { ref: list, role: 'menu', 'data-testid': 'menu', onKeydown: api.onKey },
                    ['a', 'b', 'c'].map(key => h('button', {
                        key, type: 'button', role: 'menuitem', 'data-testid': key,
                        ...(key === 'b' ? (off === 'aria' ? { 'aria-disabled': 'true' } : { disabled: true }) : {})
                    })))
            ]);
        }
    });
    wrapper = mount(Host, { attachTo: document.body });
    return wrapper;
}

const trigger = () => wrapper.find('[data-testid="trigger"]');
const item = key => wrapper.find(`[data-testid="${key}"]`);
const menu = () => wrapper.find('[role="menu"]');
const open = async () => { await trigger().trigger('click'); await nextTick(); await nextTick(); };
const key = (el, k) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
const ariaOff = el => el.getAttribute('aria-disabled') !== 'true';

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
});

describe('useMenu opening', () => {
    it('opens and closes with toggle, and says so in `open`', async () => {
        render();
        expect(api.open.value).toBe(false);
        await open();
        expect(api.open.value).toBe(true);
        expect(menu().exists()).toBe(true);
        await trigger().trigger('click');
        expect(api.open.value).toBe(false);
        expect(menu().exists()).toBe(false);
    });

    it('opens on the first item, and on the first one that is on when `isEnabled` says one is off', async () => {
        render();
        await open();
        expect(document.activeElement).toBe(item('a').element);
        wrapper.unmount();

        render({ isEnabled: ariaOff });
        await open();
        expect(document.activeElement).toBe(item('a').element);
        wrapper.unmount();

        // The first is off: the focus goes to the first that is on
        const first = el => el.getAttribute('data-testid') !== 'a';
        render({ isEnabled: first });
        await open();
        expect(document.activeElement).toBe(item('b').element);
    });

    it('opens on the first item when none is on', async () => {
        render({ isEnabled: () => false });
        await open();
        expect(document.activeElement).toBe(item('a').element);
    });

    it('opens on the down and the up arrow of the button, not on other keys', async () => {
        render();
        key(trigger().element, 'x');
        await nextTick();
        expect(api.open.value).toBe(false);
        key(trigger().element, 'ArrowDown');
        await nextTick();
        await nextTick();
        expect(api.open.value).toBe(true);
        expect(document.activeElement).toBe(item('a').element);
        wrapper.unmount();

        render();
        key(trigger().element, 'ArrowUp');
        await nextTick();
        await nextTick();
        expect(api.open.value).toBe(true);
    });

    it('leaves Enter and Space to the click of the button: it does not take them (the click would then toggle twice)', async () => {
        render();
        for (const k of ['Enter', ' ']) {
            const down = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
            trigger().element.dispatchEvent(down);
            expect(down.defaultPrevented, k).toBe(false);
        }
        expect(api.open.value).toBe(false);
    });

    it('focuses without scrolling, and runs `beforeOpen` before it opens', async () => {
        const order = [];
        beforeOpen = vi.fn(() => order.push(api.open.value ? 'open' : 'closed'));
        const focus = vi.spyOn(HTMLElement.prototype, 'focus');
        render({ beforeOpen });
        await open();
        expect(order).toEqual(['closed']);
        expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    });
});

describe('useMenu moving', () => {
    it('moves with the arrows through every item, an aria-disabled one too, around the ends', async () => {
        render({ isEnabled: ariaOff });
        await open();
        key(item('a').element, 'ArrowDown');
        expect(document.activeElement).toBe(item('b').element);
        key(item('b').element, 'ArrowDown');
        expect(document.activeElement).toBe(item('c').element);
        key(item('c').element, 'ArrowDown');
        expect(document.activeElement).toBe(item('a').element);
        key(item('a').element, 'ArrowUp');
        expect(document.activeElement).toBe(item('c').element);
        key(item('c').element, 'ArrowUp');
        expect(document.activeElement).toBe(item('b').element);
    });

    it('skips an item that the selector leaves out (a real `disabled`)', async () => {
        render({ off: 'disabled', itemSelector: '[role="menuitem"]:not(:disabled)' });
        await open();
        key(item('a').element, 'ArrowDown');
        expect(document.activeElement).toBe(item('c').element);
        key(item('c').element, 'ArrowUp');
        expect(document.activeElement).toBe(item('a').element);
    });

    it('goes to the first item on Home and to the last on End, and takes the keys', async () => {
        render();
        await open();
        const end = new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true });
        item('a').element.dispatchEvent(end);
        expect(end.defaultPrevented).toBe(true);
        expect(document.activeElement).toBe(item('c').element);
        key(item('c').element, 'Home');
        expect(document.activeElement).toBe(item('a').element);
    });

    it('goes from the button to the first item with the down arrow and to the last with the up arrow, when it is open', async () => {
        render();
        await open();
        trigger().element.focus();
        key(trigger().element, 'ArrowDown');
        expect(document.activeElement).toBe(item('a').element);
        trigger().element.focus();
        key(trigger().element, 'ArrowUp');
        expect(document.activeElement).toBe(item('c').element);
    });
});

describe('useMenu closing', () => {
    it('closes on Escape, gives the focus back to the button and does not pass the key on', async () => {
        const outside = vi.fn();
        document.addEventListener('keydown', outside);
        try {
            render();
            await open();
            key(item('a').element, 'Escape');
            await nextTick();
            expect(api.open.value).toBe(false);
            expect(document.activeElement).toBe(trigger().element);
            expect(outside).not.toHaveBeenCalled();
            // Shut, the key is not its own
            key(trigger().element, 'Escape');
            expect(outside).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', outside);
        }
    });

    it('closes on Tab from an item, whose focus would otherwise land on the button inside the menu', async () => {
        render();
        await open();
        key(item('a').element, 'Tab');
        await nextTick();
        expect(api.open.value).toBe(false);
    });

    it('`close` gives the focus back only when asked to', async () => {
        render();
        await open();
        api.close();
        await nextTick();
        expect(document.activeElement).not.toBe(trigger().element);
        await open();
        api.close({ refocus: true });
        await nextTick();
        expect(document.activeElement).toBe(trigger().element);
    });

    it('closes when the focus leaves the root, and stays open while it moves inside it', async () => {
        render();
        await open();
        await item('a').trigger('focusout', { relatedTarget: item('c').element });
        expect(api.open.value).toBe(true);
        await item('a').trigger('focusout', { relatedTarget: trigger().element });
        expect(api.open.value).toBe(true);
        await item('a').trigger('focusout', { relatedTarget: document.body });
        expect(api.open.value).toBe(false);
    });

    it('closes on a press outside the root, not on one inside it', async () => {
        render();
        await open();
        item('a').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(api.open.value).toBe(true);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await nextTick();
        expect(api.open.value).toBe(false);
    });

    it('lets go of the page when its component unmounts', () => {
        const removed = vi.spyOn(document, 'removeEventListener');
        render();
        wrapper.unmount();
        wrapper = null;
        expect(removed.mock.calls.map(c => c[0])).toContain('pointerdown');
    });
});

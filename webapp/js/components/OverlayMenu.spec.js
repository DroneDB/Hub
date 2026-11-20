/**
 * The "more" button of a viewer's toolbar and its menu: the seldom used actions, opened and left with the mouse or
 * the keyboard, inside the toolbar (so it shows in fullscreen).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import OverlayMenu from './OverlayMenu.vue';

const ITEMS = [
    { key: 'export', label: 'Export', icon: 'fa-solid fa-download' },
    { key: 'locked', label: 'Locked', disabled: true },
    { key: 'delete-saved', label: 'Delete saved measurements', icon: 'fa-solid fa-trash', danger: true }
];

let wrapper;
const render = (props = {}) => {
    wrapper = mount(OverlayMenu, { props: { label: 'More measurement actions', items: ITEMS, ...props }, attachTo: document.body });
    return wrapper;
};
afterEach(() => {
    wrapper?.unmount();
    vi.restoreAllMocks();
});

const button = () => wrapper.find('[data-testid="overlay-menu-button"]');
const menu = () => wrapper.find('[role="menu"]');
const item = key => wrapper.find(`[data-testid="overlay-menu-${key}"]`);
const open = async () => { await button().trigger('click'); await wrapper.vm.$nextTick(); };

describe('OverlayMenu', () => {
    it('is a button with a popup menu, closed at first', () => {
        render();
        expect(button().attributes('aria-label')).toBe('More measurement actions');
        expect(button().attributes('aria-haspopup')).toBe('menu');
        expect(button().attributes('aria-expanded')).toBe('false');
        expect(menu().exists()).toBe(false);
    });

    it('opens on a click with its items, the first one that is on focused, and closes on the next click', async () => {
        render();
        await open();
        expect(button().attributes('aria-expanded')).toBe('true');
        expect(menu().attributes('id')).toBe(button().attributes('aria-controls'));
        expect(wrapper.findAll('[role="menuitem"]').map(i => i.text())).toEqual(['Export', 'Locked', 'Delete saved measurements']);
        expect(document.activeElement).toBe(item('export').element);
        await button().trigger('click');
        expect(menu().exists()).toBe(false);
    });

    it('is inside the toolbar it stands in, not in the page: fullscreen draws the viewer only', async () => {
        render();
        await open();
        expect(wrapper.element.contains(menu().element)).toBe(true);
    });

    it('tells which action was chosen, closes and gives the focus back to its button', async () => {
        render();
        await open();
        await item('delete-saved').trigger('click');
        expect(wrapper.emitted('select')).toEqual([['delete-saved']]);
        expect(menu().exists()).toBe(false);
        expect(document.activeElement).toBe(button().element);
    });

    it('marks an action that deletes, and leaves an action that is off out of reach', async () => {
        render();
        await open();
        expect(item('delete-saved').classes()).toContain('danger');
        expect(item('export').classes()).not.toContain('danger');
        expect(item('locked').attributes('disabled')).toBeDefined();
    });

    it('moves between the actions that are on with the arrows, around the ends', async () => {
        render();
        await open();
        await menu().trigger('keydown', { key: 'ArrowDown' });
        expect(document.activeElement).toBe(item('delete-saved').element);
        await menu().trigger('keydown', { key: 'ArrowDown' });
        expect(document.activeElement).toBe(item('export').element);
        await menu().trigger('keydown', { key: 'ArrowUp' });
        expect(document.activeElement).toBe(item('delete-saved').element);
    });

    it('opens with the down arrow on its button', async () => {
        render();
        await button().trigger('keydown', { key: 'ArrowDown' });
        await wrapper.vm.$nextTick();
        expect(menu().exists()).toBe(true);
        expect(document.activeElement).toBe(item('export').element);
    });

    it('Escape closes it, gives the focus back, and is not passed on: it does not also cancel what the viewer draws', async () => {
        render();
        const outside = vi.fn();
        document.addEventListener('keydown', outside);
        try {
            await open();
            await item('export').trigger('keydown', { key: 'Escape' });
            expect(menu().exists()).toBe(false);
            expect(document.activeElement).toBe(button().element);
            expect(outside).not.toHaveBeenCalled();
            // Closed, the key is not its own
            await button().trigger('keydown', { key: 'Escape' });
            expect(outside).toHaveBeenCalledTimes(1);
        } finally {
            document.removeEventListener('keydown', outside);
        }
    });

    it('closes when the focus leaves it, and stays open while the focus moves inside it', async () => {
        render();
        await open();
        await item('export').trigger('focusout', { relatedTarget: item('delete-saved').element });
        expect(menu().exists()).toBe(true);
        await item('delete-saved').trigger('focusout', { relatedTarget: document.body });
        expect(menu().exists()).toBe(false);
    });

    it('closes on a press outside it (the 3D view takes no focus), not on one inside it', async () => {
        render();
        await open();
        item('export').element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(menu().exists()).toBe(true);
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        await wrapper.vm.$nextTick();
        expect(menu().exists()).toBe(false);
    });

    it('opens to the left of its button when the button is near the right edge of the window', async () => {
        render();
        vi.spyOn(button().element, 'getBoundingClientRect').mockReturnValue({ left: window.innerWidth - 40 });
        await open();
        expect(menu().classes()).toContain('align-end');
        await button().trigger('click');
        button().element.getBoundingClientRect.mockReturnValue({ left: 8 });
        await open();
        expect(menu().classes()).not.toContain('align-end');
    });

    it('lets go of the page when it unmounts', async () => {
        const removed = vi.spyOn(document, 'removeEventListener');
        render();
        wrapper.unmount();
        wrapper = null;
        expect(removed.mock.calls.map(c => c[0])).toContain('pointerdown');
    });
});

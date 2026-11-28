/**
 * The explorer's context menu draws the model of the action registry: a separator between two
 * groups, the shortcut of an item with an accelerator, and Delete in the danger colour. It reads
 * its items each time it opens, so it is the menu of what is selected then.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { h, nextTick } from 'vue';
import PrimeVue from 'primevue/config';
import ContextMenu from './ContextMenu.vue';

const items = [
    { label: 'Open', icon: 'fa-regular fa-folder-open', group: 'open', click: vi.fn() },
    { label: 'Hidden', group: 'open', isVisible: () => false },
    { label: 'Rename', icon: 'fa-solid fa-pencil', group: 'edit', click: vi.fn() },
    { label: 'Copy', icon: 'fa-solid fa-copy', group: 'organize', accelerator: 'CmdOrCtrl+C', click: vi.fn() },
    { label: 'Cut', icon: 'fa-solid fa-scissors', group: 'organize', accelerator: 'CmdOrCtrl+X', isEnabled: () => false, click: vi.fn() },
    { label: 'Delete', icon: 'fa-solid fa-trash', group: 'danger', danger: true, accelerator: 'Delete', click: vi.fn() }
];

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    document.body.innerHTML = '';
});

function mountMenu(model = items) {
    const Host = { render: () => h('div', { class: 'host' }, [h(ContextMenu, { items: model })]) };
    wrapper = mount(Host, { attachTo: document.body, global: { plugins: [PrimeVue] } });
    return wrapper.findComponent(ContextMenu);
}

/** A right click in the host of the menu: the menu opens there. */
async function rightClick() {
    wrapper.find('.host').element.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10, bubbles: true, cancelable: true }));
    await nextTick();
    await nextTick();
}

const shownLabels = menu => menu.vm.menuModel.map(i => (i.separator ? '|' : i.label));

describe('ContextMenu', () => {
    it('parts the groups with one separator each and leaves out the hidden items', async () => {
        const menu = mountMenu();
        await rightClick();
        expect(shownLabels(menu)).toEqual(['Open', '|', 'Rename', '|', 'Copy', 'Cut', '|', 'Delete']);
        expect(menu.vm.menuModel.find(i => i.label === 'Cut').disabled).toBe(true);
    });

    it('reads its items each time it opens: what they show can come from state that Vue does not track', async () => {
        // The selection of the folder tree is such a state: a plain value, read by the items
        let selection = [];
        const one = () => selection.length === 1;
        const menu = mountMenu([
            { label: 'Rename', group: 'edit', isVisible: one },
            { label: 'Delete', group: 'danger', isVisible: () => selection.length > 0, isEnabled: () => !selection.includes('locked') },
            { get label() { return selection.length ? 'Download' : 'Download entire dataset'; }, group: 'share' },
            { label: 'Tools', group: 'tools', items: [{ label: 'Build', isVisible: one }] },
            { label: 'Refresh', group: 'folder', isVisible: () => selection.length === 0 }
        ]);

        await rightClick();
        expect(shownLabels(menu)).toEqual(['Download entire dataset', '|', 'Refresh']);

        selection = ['a.jpg'];
        await rightClick();
        expect(shownLabels(menu)).toEqual(['Rename', '|', 'Delete', '|', 'Download', '|', 'Tools']);
        expect(menu.vm.menuModel.find(i => i.label === 'Tools').items.map(i => i.label)).toEqual(['Build']);
        expect(menu.vm.menuModel.find(i => i.label === 'Delete').disabled).toBe(false);
        expect([...document.body.querySelectorAll('.p-contextmenu-item-label')].map(el => el.textContent.trim()))
            .toEqual(['Rename', 'Delete', 'Download', 'Tools']);

        selection = ['a.jpg', 'locked'];
        await rightClick();
        expect(shownLabels(menu)).toEqual(['Delete', '|', 'Download']);
        expect(menu.vm.menuModel.find(i => i.label === 'Delete').disabled).toBe(true);
    });

    it('shows the shortcut of an item with an accelerator, and Delete as dangerous', async () => {
        mountMenu();
        await rightClick();
        const links = [...document.body.querySelectorAll('.p-contextmenu-item-link')];
        const byLabel = label => links.find(a => a.textContent.includes(label));
        expect(byLabel('Copy').querySelector('.menu-shortcut').textContent).toMatch(/^(Ctrl\+C|⌘C)$/);
        expect(byLabel('Copy').getAttribute('aria-keyshortcuts')).toMatch(/^(Control|Meta)\+C$/);
        expect(byLabel('Rename').querySelector('.menu-shortcut')).toBeNull();
        expect(byLabel('Delete').classList).toContain('menu-danger');
        expect(byLabel('Delete').querySelector('.menu-shortcut').textContent).toBe('Delete');
        expect(byLabel('Copy').classList).not.toContain('menu-danger');
    });
});

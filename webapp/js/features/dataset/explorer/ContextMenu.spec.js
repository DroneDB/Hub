/**
 * The explorer's context menu draws the model of the action registry: a separator between two
 * groups, the shortcut of an item with an accelerator, and Delete in the danger colour.
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

describe('ContextMenu', () => {
    it('parts the groups with one separator each and leaves out the hidden items', () => {
        const model = mountMenu().vm.menuModel;
        expect(model.map(i => (i.separator ? '|' : i.label))).toEqual(['Open', '|', 'Rename', '|', 'Copy', 'Cut', '|', 'Delete']);
        expect(model.find(i => i.label === 'Cut').disabled).toBe(true);
    });

    it('shows the shortcut of an item with an accelerator, and Delete as dangerous', async () => {
        const menu = mountMenu();
        menu.vm.$refs.ctxMenu.show(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }));
        await nextTick();
        await nextTick();
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

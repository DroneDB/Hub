/**
 * VisibilityButton (FR-NAV-03): the visibility of the open dataset after its name in the header. A user who can write
 * the dataset changes it from its menu (the three visibilities, what each means, the current one checked), and every
 * change asks first; anyone else sees the tag. It follows the session's root entry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import PrimeVue from 'primevue/config';

const h = vi.hoisted(() => ({ dataset: null, Organization: null, notify: { success: () => {}, error: () => {} } }));
vi.mock('@/libs/api/sharedRegistry', () => {
    h.Organization = vi.fn(() => ({ Dataset: () => h.dataset }));
    return { default: { Organization: (...args) => h.Organization(...args) } };
});
vi.mock('@/composables/useNotify', () => ({ useNotify: () => h.notify }));

const { default: VisibilityButton } = await import('./VisibilityButton.vue');
const { useDatasetSessionStore } = await import('@/stores/datasetSession');
const { visibilityDescription } = await import('@/libs/visibility');

const style = fs.readFileSync(path.join(__dirname, 'VisibilityButton.vue'), 'utf8').split(/<style[^>]*>/)[1];
const rule = selector => style.slice(style.indexOf(`${selector} {`)).split('}')[0];

// The menu as a list that renders its items through the component's item template
const MenuStub = {
    props: ['model'],
    methods: { toggle() {} },
    template: '<ul class="menu-stub"><li v-for="item in model" :key="item.label"><slot name="item" :item="item" :props="{ action: { onClick: item.command } }" /></li></ul>'
};
const WindowStub = { props: ['title'], emits: ['close'], template: '<div class="window-stub"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' };

let wrapper;
let root;
function rootEntry({ visibility = 0, canWrite = true, name = 'Brighton Beach' } = {}) {
    return { path: '', properties: { meta: { name: { data: name }, visibility: { id: 'v', data: visibility } }, permissions: { canRead: true, canWrite, canDelete: canWrite } } };
}
async function render(entry) {
    root = entry;
    if (entry) useDatasetSessionStore().setRootEntry(entry);
    wrapper = mount(VisibilityButton, {
        props: { org: 'acme', ds: 'brighton' },
        attachTo: document.body,
        global: { plugins: [PrimeVue], stubs: { Menu: MenuStub, Window: WindowStub } }
    });
    await flushPromises();
}
const options = () => wrapper.findAll('.visibility-option');
const option = label => options().find(o => o.find('.visibility-option-label').text().startsWith(label));
const dialogButton = text => [...document.body.querySelectorAll('.window-stub button')].find(b => b.textContent.trim() === text);

beforeEach(() => {
    setActivePinia(createPinia());
    h.dataset = { setVisibility: vi.fn(to => Promise.resolve({ id: 'v', data: to })) };
    h.Organization.mockClear();
    h.notify = { success: vi.fn(), error: vi.fn() };
});
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

describe('VisibilityButton', () => {
    it('shows nothing until the root entry is read, nor for a dataset that did not load', async () => {
        await render(null);
        expect(wrapper.find('.visibility-control').exists()).toBe(false);
        useDatasetSessionStore().setRootEntry(rootEntry());
        useDatasetSessionStore().setUnavailable(true);
        await flushPromises();
        expect(wrapper.find('.visibility-control').exists()).toBe(false);
    });

    it('is the tag only for a user who cannot write the dataset', async () => {
        await render(rootEntry({ visibility: 2, canWrite: false }));
        expect(wrapper.find('button').exists()).toBe(false);
        expect(wrapper.find('.p-tag').text()).toBe('Public');
        expect(wrapper.find('.menu-stub').exists()).toBe(false);
    });

    it('is a button with a menu for a user who can write it', async () => {
        await render(rootEntry({ visibility: 0 }));
        const button = wrapper.find('button.visibility-button');
        expect(button.exists()).toBe(true);
        expect(button.attributes('aria-haspopup')).toBe('menu');
        expect(button.attributes('aria-label')).toBe('Visibility: Private. Change the visibility');
        expect(button.find('.p-tag').text()).toBe('Private');
        expect(button.find('.p-tag .fa-caret-down').exists()).toBe(true);
    });

    it('lists Private, Unlisted and Public with what each means, the current one checked', async () => {
        await render(rootEntry({ visibility: 1 }));
        expect(options().map(o => o.find('.visibility-option-label').text())).toEqual(['Private', 'Unlisted (current)', 'Public']);
        expect(options().map(o => o.find('.visibility-option-description').text()))
            .toEqual([0, 1, 2].map(visibilityDescription));
        expect(options().map(o => o.find('.visibility-option-check').exists())).toEqual([false, true, false]);
    });

    it('asks before it changes, and changes nothing on Cancel', async () => {
        await render(rootEntry({ visibility: 0 }));
        await option('Public').trigger('click');
        await flushPromises();
        expect(document.body.textContent).toContain('Make the dataset Public?');
        expect(document.body.textContent).toContain('This changes the visibility of the dataset Brighton Beach from Private to Public.');
        dialogButton('Cancel').click();
        await flushPromises();
        expect(h.dataset.setVisibility).not.toHaveBeenCalled();
        expect(wrapper.find('.p-tag').text()).toBe('Private');
    });

    it('changes the visibility once confirmed: the tag shows it at once, on the same root entry', async () => {
        await render(rootEntry({ visibility: 0 }));
        await option('Public').trigger('click');
        await flushPromises();
        dialogButton('Make Public').click();
        await flushPromises();
        expect(h.Organization).toHaveBeenCalledWith('acme');
        expect(h.dataset.setVisibility).toHaveBeenCalledWith(2);
        expect(useDatasetSessionStore().rootEntry).toBe(root);
        expect(wrapper.find('.p-tag').text()).toBe('Public');
        expect(h.notify.success).toHaveBeenCalledWith('Brighton Beach is now Public', { summary: 'Visibility Updated' });
    });

    it('asks before making the dataset Private too', async () => {
        await render(rootEntry({ visibility: 2 }));
        await option('Private').trigger('click');
        await flushPromises();
        expect(document.body.textContent).toContain('Make the dataset Private?');
        dialogButton('Make Private').click();
        await flushPromises();
        expect(h.dataset.setVisibility).toHaveBeenCalledWith(0);
    });

    it('does nothing for the current visibility', async () => {
        await render(rootEntry({ visibility: 1 }));
        await option('Unlisted').trigger('click');
        await flushPromises();
        expect(document.body.querySelector('.window-stub')).toBeNull();
        expect(h.dataset.setVisibility).not.toHaveBeenCalled();
    });

    it('keeps the visibility the dataset has when the server refuses the change', async () => {
        h.dataset.setVisibility.mockRejectedValue(new Error('Forbidden'));
        await render(rootEntry({ visibility: 0 }));
        await option('Unlisted').trigger('click');
        await flushPromises();
        dialogButton('Make Unlisted').click();
        await flushPromises();
        expect(wrapper.find('.p-tag').text()).toBe('Private');
        expect(h.notify.error).toHaveBeenCalledWith('Failed to update visibility: Forbidden');
        expect(wrapper.find('button.visibility-button').attributes('disabled')).toBeUndefined();
    });

    it('is a label under the text of the header, in a tap target of 2rem', () => {
        expect(rule('.visibility-chip')).toContain('font-size: var(--ddb-font-size-sm);');
        expect(rule('.visibility-button')).toContain('min-height: 2rem;');
    });
});

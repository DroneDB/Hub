/**
 * Deleting an organization from its list: the question names it by its display name and slug,
 * says how many datasets go with it, and waits for the slug to be typed (AC-004).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import Dialog from 'primevue/dialog';
import PrimeVue from 'primevue/config';

vi.mock('@/libs/notify', () => ({ notify: { success: vi.fn(), error: vi.fn() } }));

const { default: DialogHost } = await import('@/components/DialogHost.vue');
const { useDialogs } = await import('./useDialogs');
const { useEntityDelete } = await import('./useEntityDelete');
const { notify } = await import('@/libs/notify');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

async function deleteOrganization(org, remove = vi.fn(() => Promise.resolve(true))) {
    let deleteEntity;
    wrapper = mount(defineComponent({
        setup() {
            const dialogs = useDialogs();
            deleteEntity = useEntityDelete(dialogs);
            return () => h(DialogHost, { dialogs });
        }
    }), { attachTo: document.body, global: { plugins: [PrimeVue] } });
    const done = vi.fn();
    const deleted = deleteEntity(org, {
        kind: 'organization', name: org.name, lost: ['3 datasets and their files'], typed: true,
        warning: 'All the datasets owned by this organization will be deleted too.', remove, done
    });
    await flushPromises();
    await wrapper.findComponent(Dialog).vm.$emit('show');
    return { deleted, remove, done };
}

const enter = target => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
const deleteButton = () => document.querySelector('.p-dialog [data-confirm]');
async function type(value) {
    const input = document.querySelector('.p-dialog input');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await flushPromises();
}

describe('useEntityDelete', () => {
    it('names the organization by its display name and slug, with its datasets, in the shared wording', async () => {
        await deleteOrganization({ slug: 'acme', name: 'Acme Corp' });
        const dialog = document.querySelector('.p-dialog');
        expect(dialog.textContent).toContain('Delete organization “Acme Corp”');
        expect(dialog.textContent).toContain('Acme Corp (acme)');
        expect(dialog.textContent).toContain('3 datasets');
        expect(deleteButton().textContent).toContain('Delete');
        expect(dialog.querySelector('[data-cancel]').textContent).toContain('Cancel');
    });

    it('focuses the slug input, and Delete stays disabled (click and Enter) until the slug is typed', async () => {
        const { remove } = await deleteOrganization({ slug: 'acme', name: 'Acme Corp' });
        const input = document.activeElement;
        expect(input.tagName).toBe('INPUT');

        enter(input);
        deleteButton().click();
        await type('Acme Corp');
        enter(input);
        await flushPromises();
        expect(deleteButton().disabled).toBe(true);
        expect(remove).not.toHaveBeenCalled();
        expect(document.querySelector('.p-dialog')).not.toBeNull();

        await type('acme');
        enter(input);
        await flushPromises();
        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('deletes, reports once and calls done after the slug is typed and Delete clicked', async () => {
        const { deleted, done } = await deleteOrganization({ slug: 'acme', name: '' });
        await type('acme');
        deleteButton().click();
        await expect(deleted).resolves.toBe(true);
        expect(done).toHaveBeenCalled();
        expect(notify.success).toHaveBeenCalledTimes(1);
    });

    it('Cancel keeps the organization', async () => {
        const { deleted, remove } = await deleteOrganization({ slug: 'acme', name: 'Acme' });
        document.querySelector('.p-dialog [data-cancel]').click();
        await expect(deleted).resolves.toBe(false);
        expect(remove).not.toHaveBeenCalled();
    });
});

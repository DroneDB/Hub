/**
 * The create dialogs of a dataset and an organization, and the import dialog, take their width from a size
 * class (FR-ORG-19, FR-UPL-08, FR-XC-20): one class, no inline size, no width of their own, so the width stays
 * the same while the user types a name that is a duplicate and then another one. The import dialog's buttons are
 * the window's footer, outside the content that scrolls.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import DatasetDialog from './DatasetDialog.vue';
import OrganizationDialog from '@/features/organizations/OrganizationDialog.vue';

const reg = vi.hoisted(() => ({ Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));
const { default: ImportDatasetDialog } = await import('./ImportDatasetDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

const mountIt = async (component, props) => {
    wrapper = mount(component, { props, attachTo: document.body, global: { plugins: [PrimeVue] } });
    await flushPromises();
    return document.querySelector('.p-dialog.window-dialog');
};
const widthStyle = dialog => dialog.getAttribute('style') || '';

describe('a size class gives the dialog its width', () => {
    it('DatasetDialog is dialog-lg and keeps the same class and no inline size while a duplicate name is typed', async () => {
        const dialog = await mountIt(DatasetDialog, { mode: 'new', forbiddenSlugs: ['t-orgs-upload'] });
        expect(dialog.classList.contains('dialog-lg')).toBe(true);
        expect(widthStyle(dialog)).not.toContain('width');
        wrapper.vm.ds.name = 'T Orgs Upload';
        await flushPromises();
        expect(dialog.textContent).toContain('already in use');
        expect(dialog.classList.contains('dialog-lg')).toBe(true);
        expect(widthStyle(dialog)).not.toContain('width');
        wrapper.vm.ds.name = 'Another name';
        await flushPromises();
        expect(dialog.textContent).not.toContain('already in use');
        expect(dialog.className.split(' ').filter(c => c.startsWith('dialog-'))).toEqual(['dialog-lg']);
        expect(widthStyle(dialog)).not.toContain('width');
    });

    it('OrganizationDialog is dialog-lg, with no inline size', async () => {
        const dialog = await mountIt(OrganizationDialog, { mode: 'new' });
        expect(dialog.classList.contains('dialog-lg')).toBe(true);
        expect(widthStyle(dialog)).not.toContain('width');
    });

    it('ImportDatasetDialog is dialog-xl, with no inline size', async () => {
        reg.Organization = vi.fn(() => ({ importSources: () => Promise.resolve(['registry']) }));
        const dialog = await mountIt(ImportDatasetDialog, { orgSlug: 'acme', forbiddenSlugs: [] });
        expect(dialog.classList.contains('dialog-xl')).toBe(true);
        expect(widthStyle(dialog)).not.toContain('width');
    });
});

describe('ImportDatasetDialog after Verify (FR-UPL-08)', () => {
    async function verified() {
        const scrollIntoView = vi.fn();
        Element.prototype.scrollIntoView = scrollIntoView;
        reg.Organization = vi.fn(() => ({
            importSources: () => Promise.resolve(['registry']),
            verifyImport: () => Promise.resolve({ reachable: true, fileCount: 3, estimatedBytes: 1024, suggestedName: 'Brighton Beach', suggestedSlug: 'brighton-beach' })
        }));
        const dialog = await mountIt(ImportDatasetDialog, { orgSlug: 'acme', forbiddenSlugs: [] });
        wrapper.vm.params.url = 'https://hub.dronedb.app';
        wrapper.vm.params.organization = 'odm';
        wrapper.vm.params.dataset = 'brighton-beach';
        await flushPromises();
        const verify = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Verify');
        verify.click();
        await flushPromises();
        return { dialog, scrollIntoView };
    }

    it('has the Import button in the window footer, outside the content that scrolls', async () => {
        const { dialog } = await verified();
        const importButton = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Import');
        expect(importButton.closest('.window-footer')).not.toBeNull();
        expect(dialog.querySelector('.window-footer [data-cancel]').textContent.trim()).toBe('Close');
        // the name, the slug are in the content, the buttons are not
        expect(dialog.querySelector('#import-dataset-dialog-slug').closest('.window-footer')).toBeNull();
    });

    it('scrolls the name, the slug and Import into view and focuses the Dataset Name', async () => {
        const { dialog, scrollIntoView } = await verified();
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
        expect(scrollIntoView.mock.contexts[0]).toBe(dialog.querySelector('.verify-result'));
        expect(document.activeElement).toBe(dialog.querySelector('#import-dataset-dialog-dataset-name'));
        expect(dialog.querySelector('#import-dataset-dialog-dataset-name').value).toBe('Brighton Beach');
    });

    it('keeps the credentials in a collapsed "Credentials (optional)" section', async () => {
        reg.Organization = vi.fn(() => ({ importSources: () => Promise.resolve(['registry']) }));
        const dialog = await mountIt(ImportDatasetDialog, { orgSlug: 'acme', forbiddenSlugs: [] });
        const toggle = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Credentials (optional)');
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        const panel = dialog.querySelector('#import-dataset-dialog-credentials');
        expect(panel.style.display).toBe('none');
        toggle.click();
        await flushPromises();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel.style.display).not.toBe('none');
        expect(panel.querySelector('#import-dataset-dialog-username')).not.toBeNull();
    });

    async function failedVerify(answer) {
        reg.Organization = vi.fn(() => ({ importSources: () => Promise.resolve(['registry']), verifyImport: answer }));
        const dialog = await mountIt(ImportDatasetDialog, { orgSlug: 'acme', forbiddenSlugs: [] });
        wrapper.vm.params.url = 'https://hub.example.org';
        wrapper.vm.params.organization = 'acme';
        wrapper.vm.params.dataset = 'private-site';
        await flushPromises();
        const toggle = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Credentials (optional)');
        const panel = dialog.querySelector('#import-dataset-dialog-credentials');
        expect(panel.style.display).toBe('none');
        [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Verify').click();
        await flushPromises();
        return { toggle, panel };
    }

    it('opens the credentials when Verify says the source is not reachable (a private source)', async () => {
        const { toggle, panel } = await failedVerify(() => Promise.resolve({ reachable: false, note: 'Unauthorized' }));
        expect(document.body.textContent).toContain('Unauthorized');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel.style.display).not.toBe('none');
    });

    it('opens the credentials when Verify fails', async () => {
        const { toggle, panel } = await failedVerify(() => Promise.reject(new Error('401 Unauthorized')));
        expect(document.body.textContent).toContain('401 Unauthorized');
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel.style.display).not.toBe('none');
    });

    it('shows a username or a password that is sent: open while one is filled, folded again once both are empty', async () => {
        reg.Organization = vi.fn(() => ({ importSources: () => Promise.resolve(['registry']) }));
        const dialog = await mountIt(ImportDatasetDialog, { orgSlug: 'acme', forbiddenSlugs: [] });
        const toggle = [...dialog.querySelectorAll('button')].find(b => b.textContent.trim() === 'Credentials (optional)');
        const panel = dialog.querySelector('#import-dataset-dialog-credentials');
        // a value the browser filled in, or one kept from before: never sent from a folded section
        wrapper.vm.params.password = 'secret';
        await flushPromises();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel.style.display).not.toBe('none');
        // it cannot be folded over a value
        expect(toggle.disabled).toBe(true);
        toggle.click();
        await flushPromises();
        expect(panel.style.display).not.toBe('none');
        wrapper.vm.params.password = '';
        wrapper.vm.params.username = 'pilot';
        await flushPromises();
        expect(panel.style.display).not.toBe('none');
        wrapper.vm.params.username = '';
        await flushPromises();
        expect(toggle.disabled).toBe(false);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(panel.style.display).toBe('none');
    });
});

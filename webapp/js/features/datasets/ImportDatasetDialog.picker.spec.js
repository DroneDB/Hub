/**
 * The organization and dataset pickers of the Import dialog (FR-UPL-15, FR-XC-20): both Selects filter (a
 * list of 173 organizations is searched, not scrolled), name the filter field, and set no width of their own
 * (the global Select-overlay rule keeps the list inside a phone).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import PrimeVue from 'primevue/config';
import Select from 'primevue/select';

const reg = vi.hoisted(() => ({ Organization: null }));
vi.mock('@/libs/api/sharedRegistry', () => ({ default: reg }));

const { default: ImportDatasetDialog } = await import('./ImportDatasetDialog.vue');

let wrapper;
afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
});

async function render() {
    reg.Organization = vi.fn(() => ({ importSources: () => Promise.resolve(['registry']) }));
    wrapper = mount(ImportDatasetDialog, {
        props: { orgSlug: 'acme', forbiddenSlugs: [] },
        attachTo: document.body,
        global: { plugins: [PrimeVue] }
    });
    await flushPromises();
    wrapper.vm.remoteOrgs = Array.from({ length: 173 }, (_, i) => ({ label: `Organization ${i} (org-${i})`, value: `org-${i}` }));
    wrapper.vm.remoteDatasets = [{ label: 'Brighton beach (brighton-beach)', value: 'brighton-beach' }];
    await flushPromises();
}
const picker = id => wrapper.findAllComponents(Select).find(s => s.props('inputId') === id);

describe('ImportDatasetDialog pickers', () => {
    it('searches the organizations: filter on, placeholder and accessible name for the filter field', async () => {
        await render();
        const orgs = picker('import-dataset-dialog-organization');
        expect(orgs.props('options')).toHaveLength(173);
        expect(orgs.props('filter')).toBe(true);
        expect(orgs.props('filterPlaceholder')).toBe('Search organizations');
        await orgs.find('.p-select-label').trigger('click');
        await flushPromises();
        const input = document.querySelector('.p-select-overlay input[role="searchbox"]');
        expect(input.getAttribute('aria-label')).toBe('Search organizations');
    });

    it('searches the datasets too', async () => {
        await render();
        const datasets = picker('import-dataset-dialog-dataset');
        expect(datasets.props('filter')).toBe(true);
        expect(datasets.props('filterPlaceholder')).toBe('Search datasets');
    });

    it('filters by label and by slug', async () => {
        await render();
        expect(picker('import-dataset-dialog-organization').props('filterFields')).toEqual(['label', 'value']);
    });

    it('sets no width of its own on a list, and lets the Select shrink inside the row of the dialog', async () => {
        await render();
        for (const id of ['import-dataset-dialog-organization', 'import-dataset-dialog-dataset']) {
            const select = picker(id);
            expect(select.props('overlayStyle')).toBeNull();
            expect(select.props('overlayClass')).toBeNull();
            expect(select.attributes('style')).toContain('min-width: 0');
        }
    });
});
